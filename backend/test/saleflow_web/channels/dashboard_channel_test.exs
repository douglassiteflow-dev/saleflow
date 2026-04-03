defmodule SaleflowWeb.DashboardChannelTest do
  use ExUnit.Case, async: true

  import Phoenix.ChannelTest

  @endpoint SaleflowWeb.Endpoint

  alias SaleflowWeb.DashboardChannel
  alias SaleflowWeb.UserSocket

  setup do
    {:ok, _, socket} =
      UserSocket
      |> socket("user:123", %{user_id: "some-user-id", user_name: "Test User"})
      |> subscribe_and_join(DashboardChannel, "dashboard:updates")

    %{socket: socket}
  end

  describe "join/3" do
    test "joins dashboard:updates successfully", %{socket: socket} do
      assert socket.joined
      assert socket.topic == "dashboard:updates"
    end
  end

  describe "handle_info/2" do
    test "pushes stats_updated on :dashboard_update message", %{socket: socket} do
      payload = %{
        total_calls: 42,
        meetings_booked: 5,
        avg_call_duration: 180
      }

      send(socket.channel_pid, {:dashboard_update, payload})

      assert_push "stats_updated", ^payload
    end

    test "pushes partial stats update", %{socket: socket} do
      payload = %{total_calls: 10}

      send(socket.channel_pid, {:dashboard_update, payload})

      assert_push "stats_updated", ^payload
    end

    test "pushes empty payload", %{socket: socket} do
      payload = %{}

      send(socket.channel_pid, {:dashboard_update, payload})

      assert_push "stats_updated", ^payload
    end
  end
end
