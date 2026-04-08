defmodule Saleflow.Workers.CallTopicsExtractionTest do
  use Saleflow.DataCase

  alias Saleflow.Workers.TranscriptionWorker

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_phone_call do
    {:ok, phone_call} =
      Saleflow.Sales.create_phone_call(%{
        caller: "+46701111111",
        callee: "+46812345678",
        duration: 120,
        direction: :outgoing
      })

    phone_call
  end

  defp get_call_topics(phone_call_id) do
    {:ok, %{rows: rows, columns: cols}} =
      Saleflow.Repo.query(
        "SELECT topic_type, keyword, context, timestamp_seconds, sentiment FROM call_topics WHERE phone_call_id = $1 ORDER BY topic_type, keyword",
        [Ecto.UUID.dump!(phone_call_id)]
      )

    Enum.map(rows, fn row ->
      cols |> Enum.zip(row) |> Map.new()
    end)
  end

  defp count_call_topics(phone_call_id) do
    {:ok, %{rows: [[count]]}} =
      Saleflow.Repo.query(
        "SELECT COUNT(*) FROM call_topics WHERE phone_call_id = $1",
        [Ecto.UUID.dump!(phone_call_id)]
      )

    count
  end

  # ---------------------------------------------------------------------------
  # Tests: full analysis with all topic types
  # ---------------------------------------------------------------------------

  describe "save_call_topics/2 with full analysis" do
    test "extracts competitors, buying_signals, red_flags, and objections" do
      phone_call = create_phone_call()

      analysis = %{
        "keywords" => %{
          "competitors" => [
            %{"name" => "Företag X", "context" => "Kunden nämnde Företag X", "timestamp" => "135"},
            %{"name" => "Företag Y", "context" => "Jämförde med Företag Y", "timestamp" => "240"}
          ],
          "buying_signals" => [
            %{"signal" => "vi är intresserade", "context" => "Kunden visade intresse", "timestamp" => "330"}
          ],
          "red_flags" => [
            %{"flag" => "vi har redan en leverantör", "context" => "Invändning om befintlig leverantör", "timestamp" => "105"}
          ]
        },
        "objections" => ["för dyrt", "vi har inte tid"]
      }

      TranscriptionWorker.save_call_topics(phone_call.id, analysis)

      topics = get_call_topics(phone_call.id)

      # 2 competitors + 1 buying_signal + 1 red_flag + 2 objections = 6
      assert length(topics) == 6

      competitors = Enum.filter(topics, &(&1["topic_type"] == "competitor"))
      assert length(competitors) == 2
      assert Enum.any?(competitors, &(&1["keyword"] == "Företag X"))
      assert Enum.any?(competitors, &(&1["keyword"] == "Företag Y"))

      buying_signals = Enum.filter(topics, &(&1["topic_type"] == "buying_signal"))
      assert length(buying_signals) == 1
      assert hd(buying_signals)["keyword"] == "vi är intresserade"
      assert hd(buying_signals)["context"] == "Kunden visade intresse"
      assert hd(buying_signals)["timestamp_seconds"] == 330

      red_flags = Enum.filter(topics, &(&1["topic_type"] == "red_flag"))
      assert length(red_flags) == 1
      assert hd(red_flags)["keyword"] == "vi har redan en leverantör"
      assert hd(red_flags)["timestamp_seconds"] == 105

      objections = Enum.filter(topics, &(&1["topic_type"] == "objection"))
      assert length(objections) == 2
      assert Enum.all?(objections, &(&1["sentiment"] == "negative"))
      assert Enum.any?(objections, &(&1["keyword"] == "för dyrt"))
      assert Enum.any?(objections, &(&1["keyword"] == "vi har inte tid"))
    end

    test "saves context for keyword items" do
      phone_call = create_phone_call()

      analysis = %{
        "keywords" => %{
          "competitors" => [
            %{"name" => "Salesforce", "context" => "Kunden använder Salesforce idag", "timestamp" => "60"}
          ],
          "buying_signals" => [],
          "red_flags" => []
        },
        "objections" => []
      }

      TranscriptionWorker.save_call_topics(phone_call.id, analysis)

      topics = get_call_topics(phone_call.id)
      assert length(topics) == 1

      competitor = hd(topics)
      assert competitor["keyword"] == "Salesforce"
      assert competitor["context"] == "Kunden använder Salesforce idag"
      assert competitor["timestamp_seconds"] == 60
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: empty keywords
  # ---------------------------------------------------------------------------

  describe "save_call_topics/2 with empty keywords" do
    test "creates no rows when all keyword arrays are empty" do
      phone_call = create_phone_call()

      analysis = %{
        "keywords" => %{
          "competitors" => [],
          "buying_signals" => [],
          "red_flags" => []
        },
        "objections" => []
      }

      TranscriptionWorker.save_call_topics(phone_call.id, analysis)

      assert count_call_topics(phone_call.id) == 0
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: nil keywords
  # ---------------------------------------------------------------------------

  describe "save_call_topics/2 with nil keywords" do
    test "creates no rows when keywords key is nil" do
      phone_call = create_phone_call()

      analysis = %{"keywords" => nil, "objections" => nil}

      TranscriptionWorker.save_call_topics(phone_call.id, analysis)

      assert count_call_topics(phone_call.id) == 0
    end

    test "creates no rows when keywords key is missing entirely" do
      phone_call = create_phone_call()

      analysis = %{}

      TranscriptionWorker.save_call_topics(phone_call.id, analysis)

      assert count_call_topics(phone_call.id) == 0
    end

    test "creates no rows when individual keyword categories are nil" do
      phone_call = create_phone_call()

      analysis = %{
        "keywords" => %{
          "competitors" => nil,
          "buying_signals" => nil,
          "red_flags" => nil
        },
        "objections" => nil
      }

      TranscriptionWorker.save_call_topics(phone_call.id, analysis)

      assert count_call_topics(phone_call.id) == 0
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: mixed types (some with timestamps, some without)
  # ---------------------------------------------------------------------------

  describe "save_call_topics/2 with mixed timestamps" do
    test "handles items with and without timestamps" do
      phone_call = create_phone_call()

      analysis = %{
        "keywords" => %{
          "competitors" => [
            %{"name" => "Med timestamp", "timestamp" => "120"},
            %{"name" => "Utan timestamp"},
            %{"name" => "Med int timestamp", "timestamp" => 300}
          ],
          "buying_signals" => [],
          "red_flags" => []
        },
        "objections" => ["en invändning"]
      }

      TranscriptionWorker.save_call_topics(phone_call.id, analysis)

      topics = get_call_topics(phone_call.id)

      # 3 competitors + 1 objection = 4
      assert length(topics) == 4

      competitors = Enum.filter(topics, &(&1["topic_type"] == "competitor"))
      with_ts = Enum.find(competitors, &(&1["keyword"] == "Med timestamp"))
      without_ts = Enum.find(competitors, &(&1["keyword"] == "Utan timestamp"))
      with_int_ts = Enum.find(competitors, &(&1["keyword"] == "Med int timestamp"))

      assert with_ts["timestamp_seconds"] == 120
      assert is_nil(without_ts["timestamp_seconds"])
      assert with_int_ts["timestamp_seconds"] == 300

      # Objections have nil timestamps
      objection = Enum.find(topics, &(&1["topic_type"] == "objection"))
      assert is_nil(objection["timestamp_seconds"])
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: parse_timestamp edge cases
  # ---------------------------------------------------------------------------

  describe "parse_timestamp/1" do
    test "returns nil for nil" do
      assert is_nil(TranscriptionWorker.parse_timestamp(nil))
    end

    test "returns integer as-is" do
      assert TranscriptionWorker.parse_timestamp(42) == 42
      assert TranscriptionWorker.parse_timestamp(0) == 0
    end

    test "parses string integers" do
      assert TranscriptionWorker.parse_timestamp("120") == 120
      assert TranscriptionWorker.parse_timestamp("0") == 0
    end

    test "parses string with trailing text" do
      assert TranscriptionWorker.parse_timestamp("120s") == 120
      assert TranscriptionWorker.parse_timestamp("45 seconds") == 45
    end

    test "returns nil for non-numeric strings" do
      assert is_nil(TranscriptionWorker.parse_timestamp("not a number"))
      assert is_nil(TranscriptionWorker.parse_timestamp(""))
    end

    test "returns nil for other types" do
      assert is_nil(TranscriptionWorker.parse_timestamp(%{}))
      assert is_nil(TranscriptionWorker.parse_timestamp([]))
      assert is_nil(TranscriptionWorker.parse_timestamp(3.14))
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: extract_topic_list edge cases
  # ---------------------------------------------------------------------------

  describe "extract_topic_list/2" do
    test "returns empty list for nil" do
      assert TranscriptionWorker.extract_topic_list(nil, "competitor") == []
    end

    test "returns empty list for non-list values" do
      assert TranscriptionWorker.extract_topic_list("string", "competitor") == []
      assert TranscriptionWorker.extract_topic_list(%{}, "competitor") == []
      assert TranscriptionWorker.extract_topic_list(42, "competitor") == []
    end

    test "extracts keyword from different field names" do
      # Uses "keyword" field
      items_keyword = [%{"keyword" => "test keyword"}]
      result = TranscriptionWorker.extract_topic_list(items_keyword, "competitor")
      assert hd(result).keyword == "test keyword"

      # Uses "name" field (for competitors)
      items_name = [%{"name" => "Företag Z"}]
      result = TranscriptionWorker.extract_topic_list(items_name, "competitor")
      assert hd(result).keyword == "Företag Z"

      # Uses "signal" field (for buying_signals)
      items_signal = [%{"signal" => "vi vill boka"}]
      result = TranscriptionWorker.extract_topic_list(items_signal, "buying_signal")
      assert hd(result).keyword == "vi vill boka"

      # Uses "flag" field (for red_flags)
      items_flag = [%{"flag" => "inte intresserade"}]
      result = TranscriptionWorker.extract_topic_list(items_flag, "red_flag")
      assert hd(result).keyword == "inte intresserade"
    end

    test "defaults to empty string when no recognized keyword field" do
      items = [%{"unrecognized" => "value"}]
      result = TranscriptionWorker.extract_topic_list(items, "competitor")
      assert hd(result).keyword == ""
    end

    test "defaults context to empty string when missing" do
      items = [%{"name" => "test"}]
      result = TranscriptionWorker.extract_topic_list(items, "competitor")
      assert hd(result).context == ""
    end

    test "sets sentiment to nil for all topic list items" do
      items = [%{"name" => "test"}]
      result = TranscriptionWorker.extract_topic_list(items, "competitor")
      assert is_nil(hd(result).sentiment)
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: extract_objections edge cases
  # ---------------------------------------------------------------------------

  describe "extract_objections/1" do
    test "returns empty list for nil" do
      assert TranscriptionWorker.extract_objections(nil) == []
    end

    test "returns empty list for non-list values" do
      assert TranscriptionWorker.extract_objections("string") == []
      assert TranscriptionWorker.extract_objections(%{}) == []
      assert TranscriptionWorker.extract_objections(42) == []
    end

    test "converts each objection to a topic with type objection and negative sentiment" do
      result = TranscriptionWorker.extract_objections(["för dyrt", "ingen tid"])

      assert length(result) == 2
      assert Enum.all?(result, &(&1.type == "objection"))
      assert Enum.all?(result, &(&1.sentiment == "negative"))
      assert Enum.all?(result, &is_nil(&1.timestamp))
      assert Enum.all?(result, &is_nil(&1.context))
    end

    test "converts non-string objections to string" do
      result = TranscriptionWorker.extract_objections([123, :atom])

      assert hd(result).keyword == "123"
      assert Enum.at(result, 1).keyword == "atom"
    end

    test "handles empty list" do
      assert TranscriptionWorker.extract_objections([]) == []
    end
  end
end
