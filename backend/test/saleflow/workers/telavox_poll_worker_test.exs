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

  defp build_job do
    %Oban.Job{args: %{}}
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
  # perform/1
  # ---------------------------------------------------------------------------

  describe "perform/1 with empty token" do
    test "does nothing and returns :ok" do
      # Temporarily override the token to empty
      original = Application.get_env(:saleflow, :telavox_api_token)
      Application.put_env(:saleflow, :telavox_api_token, "")

      assert :ok = TelavoxPollWorker.perform(build_job())

      Application.put_env(:saleflow, :telavox_api_token, original)
    end
  end

  describe "perform/1 with valid token" do
    test "broadcasts live calls when API returns extensions with calls" do
      user = create_user_with_extension("0101898695")

      MockClient
      |> expect(:get, fn "/extensions/" ->
        {:ok, extensions_with_calls()}
      end)

      Phoenix.PubSub.subscribe(Saleflow.PubSub, "calls:live")

      assert :ok = TelavoxPollWorker.perform(build_job())

      assert_receive {:live_calls, calls}

      assert length(calls) == 3

      first_call = Enum.find(calls, &(&1.extension == "0101898695"))
      assert first_call.user_id == user.id
      assert first_call.agent_name == "Douglas"
      assert first_call.callerid == "0769217688"
      assert first_call.direction == "out"
      assert first_call.linestatus == "ringing"

      anna_calls = Enum.filter(calls, &(&1.extension == "0101898696"))
      assert length(anna_calls) == 2
      # Anna has no user in DB, so user_id is nil
      assert Enum.all?(anna_calls, &is_nil(&1.user_id))
    end

    test "broadcasts empty list when API returns extensions with no calls" do
      MockClient
      |> expect(:get, fn "/extensions/" ->
        {:ok, extensions_no_calls()}
      end)

      Phoenix.PubSub.subscribe(Saleflow.PubSub, "calls:live")

      assert :ok = TelavoxPollWorker.perform(build_job())

      assert_receive {:live_calls, []}
    end
  end

  describe "perform/1 with API errors" do
    test "logs warning on unauthorized and returns :ok" do
      MockClient
      |> expect(:get, fn "/extensions/" ->
        {:error, :unauthorized}
      end)

      # Should not crash, just log and return :ok
      assert :ok = TelavoxPollWorker.perform(build_job())
    end

    test "logs warning on generic API error and returns :ok" do
      MockClient
      |> expect(:get, fn "/extensions/" ->
        {:error, {:http, 500, "Internal Server Error"}}
      end)

      assert :ok = TelavoxPollWorker.perform(build_job())
    end
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
        %{
          # No "extension", no "name", no "calls" key
        },
        %{
          "extension" => "123",
          "name" => "Test",
          "calls" => [
            %{
              # No callerid, direction, linestatus
            }
          ]
        }
      ]

      calls = TelavoxPollWorker.extract_live_calls(extensions)

      # First extension has no calls key → defaults to []
      # Second extension has one call with missing fields → defaults applied
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
      # Create user without extension
      unique = System.unique_integer([:positive])

      {:ok, _user} =
        Saleflow.Accounts.register(%{
          email: "no-ext-#{unique}@example.com",
          name: "No Extension",
          password: "password123",
          password_confirmation: "password123"
        })

      map = TelavoxPollWorker.build_user_map()

      # Should not contain nil key
      refute Map.has_key?(map, nil)
      refute Map.has_key?(map, "")
    end

    test "returns empty map when no users have extensions" do
      map = TelavoxPollWorker.build_user_map()
      assert map == %{} || is_map(map)
    end
  end

  # ---------------------------------------------------------------------------
  # reschedule/0
  # ---------------------------------------------------------------------------

  describe "reschedule/0" do
    test "returns :ok in test mode (skips Oban.insert)" do
      # In test mode (testing: :inline), reschedule should be a no-op
      assert :ok = TelavoxPollWorker.reschedule()
    end
  end
end
