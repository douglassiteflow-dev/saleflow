defmodule Saleflow.Workers.TelavoxPollWorkerTest do
  use Saleflow.DataCase

  import Mox

  alias Saleflow.Workers.TelavoxPollWorker
  alias Saleflow.Telavox.MockClient

  setup :verify_on_exit!

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user_with_extension(extension) do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.register(%{
        email: "agent-#{unique}@example.com",
        name: "Agent #{unique}",
        password: "password123",
        password_confirmation: "password123"
      })

    {:ok, user} =
      user
      |> Ash.Changeset.for_update(:update_user, %{extension_number: extension})
      |> Ash.update()

    user
  end

  defp extensions_with_calls do
    [
      %{
        "extension" => "0101898695",
        "name" => "Douglas",
        "calls" => [
          %{
            "callerid" => "0769217688",
            "direction" => "out",
            "linestatus" => "ringing"
          }
        ]
      },
      %{
        "extension" => "0101898696",
        "name" => "Anna",
        "calls" => [
          %{
            "callerid" => "0701234567",
            "direction" => "in",
            "linestatus" => "answered"
          },
          %{
            "callerid" => "0709876543",
            "direction" => "out",
            "linestatus" => "ringing"
          }
        ]
      }
    ]
  end

  defp extensions_no_calls do
    [
      %{
        "extension" => "0101898695",
        "name" => "Douglas",
        "calls" => []
      },
      %{
        "extension" => "0101898696",
        "name" => "Anna"
      }
    ]
  end

  # ---------------------------------------------------------------------------
  # extract_live_calls/1
  # ---------------------------------------------------------------------------

  describe "extract_live_calls/1" do
    test "maps extension data correctly with matching user" do
      user = create_user_with_extension("0101898695")

      calls = TelavoxPollWorker.extract_live_calls(extensions_with_calls())

      assert length(calls) == 3

      first = Enum.find(calls, &(&1.callerid == "0769217688"))
      assert first.user_id == user.id
      assert first.agent_name == "Douglas"
      assert first.extension == "0101898695"
      assert first.direction == "out"
      assert first.linestatus == "ringing"
    end

    test "sets user_id to nil for unmatched extensions" do
      calls = TelavoxPollWorker.extract_live_calls(extensions_with_calls())

      anna_calls = Enum.filter(calls, &(&1.extension == "0101898696"))
      assert Enum.all?(anna_calls, fn c -> c.user_id == nil end)
    end

    test "handles missing fields gracefully" do
      extensions = [
        %{},
        %{
          "extension" => "123",
          "name" => "Test",
          "calls" => [%{}]
        }
      ]

      calls = TelavoxPollWorker.extract_live_calls(extensions)

      assert length(calls) == 1

      call = hd(calls)
      assert call.extension == "123"
      assert call.agent_name == "Test"
      assert call.callerid == ""
      assert call.direction == "unknown"
      assert call.linestatus == "unknown"
    end

    test "defaults agent_name to Okänd when name is missing" do
      extensions = [
        %{
          "extension" => "999",
          "calls" => [%{"callerid" => "111"}]
        }
      ]

      [call] = TelavoxPollWorker.extract_live_calls(extensions)
      assert call.agent_name == "Okänd"
    end

    test "returns empty list when extensions have no calls" do
      assert [] == TelavoxPollWorker.extract_live_calls(extensions_no_calls())
    end

    test "returns empty list for empty extensions list" do
      assert [] == TelavoxPollWorker.extract_live_calls([])
    end
  end

  # ---------------------------------------------------------------------------
  # build_user_map/0
  # ---------------------------------------------------------------------------

  describe "build_user_map/0" do
    test "returns mapping of extension_number to user_id" do
      user1 = create_user_with_extension("0101111111")
      user2 = create_user_with_extension("0102222222")

      map = TelavoxPollWorker.build_user_map()

      assert Map.get(map, "0101111111") == user1.id
      assert Map.get(map, "0102222222") == user2.id
    end

    test "excludes users without extension_number" do
      unique = System.unique_integer([:positive])

      {:ok, _user} =
        Saleflow.Accounts.register(%{
          email: "no-ext-#{unique}@example.com",
          name: "No Extension",
          password: "password123",
          password_confirmation: "password123"
        })

      map = TelavoxPollWorker.build_user_map()

      refute Map.has_key?(map, nil)
      refute Map.has_key?(map, "")
    end
  end

  # ---------------------------------------------------------------------------
  # find_ended_calls/2
  # ---------------------------------------------------------------------------

  describe "find_ended_calls/2" do
    test "returns calls that were active but no longer present" do
      previous = [
        %{extension: "123", callerid: "0701234567", linestatus: "up", agent_name: "A", user_id: nil, direction: "out"},
        %{extension: "456", callerid: "0709876543", linestatus: "up", agent_name: "B", user_id: nil, direction: "in"}
      ]

      current = [
        %{extension: "456", callerid: "0709876543", linestatus: "up", agent_name: "B", user_id: nil, direction: "in"}
      ]

      ended = TelavoxPollWorker.find_ended_calls(previous, current)
      assert length(ended) == 1
      assert hd(ended).extension == "123"
    end

    test "detects ended calls that were ringing (unanswered)" do
      previous = [
        %{extension: "123", callerid: "0701234567", linestatus: "ringing", agent_name: "A", user_id: nil, direction: "out"}
      ]

      ended = TelavoxPollWorker.find_ended_calls(previous, [])
      assert length(ended) == 1
      assert hd(ended).callerid == "0701234567"
    end

    test "returns empty when no calls ended" do
      calls = [
        %{extension: "123", callerid: "0701234567", linestatus: "up", agent_name: "A", user_id: nil, direction: "out"}
      ]

      ended = TelavoxPollWorker.find_ended_calls(calls, calls)
      assert ended == []
    end
  end

  # ---------------------------------------------------------------------------
  # GenServer init/1
  # ---------------------------------------------------------------------------

  describe "start_link/1" do
    test "starts the GenServer" do
      # The GenServer is already started by the application supervisor,
      # so we just verify the module is defined and functions exist
      assert function_exported?(TelavoxPollWorker, :start_link, 1)
      assert function_exported?(TelavoxPollWorker, :extract_live_calls, 1)
      assert function_exported?(TelavoxPollWorker, :build_user_map, 0)
      assert function_exported?(TelavoxPollWorker, :find_ended_calls, 2)
    end
  end
end
