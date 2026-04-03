defmodule SaleflowWeb.CallsChannelTest do
  use ExUnit.Case, async: true

  import Phoenix.ChannelTest

  @endpoint SaleflowWeb.Endpoint

  alias SaleflowWeb.CallsChannel
  alias SaleflowWeb.UserSocket

  setup do
    {:ok, _, socket} =
      UserSocket
      |> socket("user:123", %{user_id: "some-user-id", user_name: "Test User"})
      |> subscribe_and_join(CallsChannel, "calls:live")

    %{socket: socket}
  end

  describe "join/3" do
    test "joins calls:live successfully", %{socket: socket} do
      assert socket.joined
      assert socket.topic == "calls:live"
    end
  end

  describe "handle_info/2" do
    test "pushes live_calls on :live_calls message", %{socket: socket} do
      calls = [
        %{id: "call-1", caller: "+46701234567", state: "ringing"},
        %{id: "call-2", caller: "+46709876543", state: "answered"}
      ]

      send(socket.channel_pid, {:live_calls, calls})

      assert_push "live_calls", %{calls: ^calls}
    end

    test "pushes empty list of calls", %{socket: socket} do
      send(socket.channel_pid, {:live_calls, []})

      assert_push "live_calls", %{calls: []}
    end

    test "pushes single call", %{socket: socket} do
      calls = [%{id: "call-1", caller: "+46701234567", state: "answered", duration: 45}]

      send(socket.channel_pid, {:live_calls, calls})

      assert_push "live_calls", %{calls: ^calls}
    end
  end
end
