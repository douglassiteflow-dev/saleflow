defmodule Saleflow.Accounts.TrustedDeviceTest do
  use Saleflow.DataCase

  alias Saleflow.Accounts

  @user_params %{
    email: "device-test@example.com",
    name: "Device Test User",
    password: "password123",
    password_confirmation: "password123"
  }

  setup do
    {:ok, user} = Accounts.register(@user_params)
    %{user: user}
  end

  describe "create_trusted_device/2" do
    test "creates a trusted device with a unique token", %{user: user} do
      {:ok, device} = Accounts.create_trusted_device(user, "Chrome / Desktop")

      assert device.user_id == user.id
      assert device.device_name == "Chrome / Desktop"
      assert device.device_token != nil
      assert String.length(device.device_token) > 20
      assert DateTime.compare(device.expires_at, DateTime.utc_now()) == :gt
    end

    test "creates device with nil device_name", %{user: user} do
      {:ok, device} = Accounts.create_trusted_device(user)

      assert device.user_id == user.id
      assert device.device_name == nil
      assert device.device_token != nil
    end

    test "each device gets a unique token", %{user: user} do
      {:ok, d1} = Accounts.create_trusted_device(user, "Device 1")
      {:ok, d2} = Accounts.create_trusted_device(user, "Device 2")

      refute d1.device_token == d2.device_token
    end
  end

  describe "find_trusted_device/2" do
    test "finds a valid trusted device", %{user: user} do
      {:ok, device} = Accounts.create_trusted_device(user, "Chrome")

      {:ok, found} = Accounts.find_trusted_device(user.id, device.device_token)

      assert found != nil
      assert found.id == device.id
    end

    test "returns nil for non-existent token", %{user: user} do
      {:ok, nil} = Accounts.find_trusted_device(user.id, "nonexistent-token")
    end

    test "returns nil for wrong user_id", %{user: user} do
      {:ok, device} = Accounts.create_trusted_device(user, "Chrome")

      {:ok, nil} = Accounts.find_trusted_device(Ecto.UUID.generate(), device.device_token)
    end

    test "returns nil for expired device", %{user: user} do
      {:ok, device} = Accounts.create_trusted_device(user, "Chrome")

      # Manually expire the device via raw SQL
      expired_at = DateTime.add(DateTime.utc_now(), -3600, :second)

      Saleflow.Repo.query!(
        "UPDATE trusted_devices SET expires_at = $1 WHERE id = $2",
        [expired_at, Ecto.UUID.dump!(device.id)]
      )

      {:ok, nil} = Accounts.find_trusted_device(user.id, device.device_token)
    end
  end

  describe "delete_trusted_devices_for_user/1" do
    test "deletes all devices for a user", %{user: user} do
      require Ash.Query

      {:ok, _d1} = Accounts.create_trusted_device(user, "Device 1")
      {:ok, _d2} = Accounts.create_trusted_device(user, "Device 2")

      assert :ok = Accounts.delete_trusted_devices_for_user(user.id)

      # Verify none remain
      {:ok, devices} =
        Saleflow.Accounts.TrustedDevice
        |> Ash.Query.filter(user_id == ^user.id)
        |> Ash.read()

      assert devices == []
    end
  end

  describe "delete_expired_trusted_devices/0" do
    test "deletes expired devices", %{user: user} do
      {:ok, device} = Accounts.create_trusted_device(user, "Chrome")

      # Manually expire the device via raw SQL
      expired_at = DateTime.add(DateTime.utc_now(), -3600, :second)

      Saleflow.Repo.query!(
        "UPDATE trusted_devices SET expires_at = $1 WHERE id = $2",
        [expired_at, Ecto.UUID.dump!(device.id)]
      )

      assert :ok = Accounts.delete_expired_trusted_devices()

      {:ok, nil} = Accounts.find_trusted_device(user.id, device.device_token)
    end
  end
end
