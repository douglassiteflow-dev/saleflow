defmodule Saleflow.Accounts.PasswordResetTokenTest do
  use Saleflow.DataCase

  alias Saleflow.Accounts

  @user_params %{
    email: "reset-test@example.com",
    name: "Reset Test User",
    password: "password123",
    password_confirmation: "password123"
  }

  setup do
    {:ok, user} = Accounts.register(@user_params)
    %{user: user}
  end

  describe "request_password_reset/1" do
    test "returns :ok for existing user", %{user: _user} do
      assert :ok = Accounts.request_password_reset("reset-test@example.com")
    end

    test "returns :ok for non-existing email (no leak)" do
      assert :ok = Accounts.request_password_reset("nonexistent@example.com")
    end
  end

  describe "reset_password/3" do
    test "resets password with valid token", %{user: _user} do
      :ok = Accounts.request_password_reset("reset-test@example.com")

      # Find the token that was created
      {:ok, [reset_token | _]} = Saleflow.Accounts.PasswordResetToken |> Ash.read()

      {:ok, _user} =
        Accounts.reset_password(reset_token.token, "newpassword456", "newpassword456")

      # Verify new password works
      {:ok, user} =
        Accounts.sign_in(%{email: "reset-test@example.com", password: "newpassword456"})

      assert user != nil
    end

    test "fails with invalid token" do
      assert {:error, :invalid_or_expired_token} =
               Accounts.reset_password("bad-token", "newpass123", "newpass123")
    end

    test "fails when passwords don't match" do
      assert {:error, :passwords_do_not_match} =
               Accounts.reset_password("any-token", "pass1", "pass2")
    end

    test "fails with already-used token", %{user: _user} do
      :ok = Accounts.request_password_reset("reset-test@example.com")

      {:ok, [reset_token | _]} = Saleflow.Accounts.PasswordResetToken |> Ash.read()

      {:ok, _} =
        Accounts.reset_password(reset_token.token, "newpassword456", "newpassword456")

      # Try again with same token
      assert {:error, :invalid_or_expired_token} =
               Accounts.reset_password(reset_token.token, "anotherpass", "anotherpass")
    end

    test "invalidates all sessions after reset", %{user: user} do
      # Create a login session
      {:ok, session} =
        Accounts.create_login_session(user, %{
          ip_address: "127.0.0.1",
          user_agent: "test-agent"
        })

      :ok = Accounts.request_password_reset("reset-test@example.com")

      {:ok, [reset_token | _]} = Saleflow.Accounts.PasswordResetToken |> Ash.read()

      {:ok, _} =
        Accounts.reset_password(reset_token.token, "newpassword456", "newpassword456")

      # Session should be force-logged-out
      {:ok, updated_session} = Accounts.find_session_by_token(session.session_token)
      refute is_nil(updated_session.logged_out_at)
    end

    test "invalidates trusted devices after reset", %{user: user} do
      {:ok, device} = Accounts.create_trusted_device(user, "Chrome")

      :ok = Accounts.request_password_reset("reset-test@example.com")

      {:ok, [reset_token | _]} = Saleflow.Accounts.PasswordResetToken |> Ash.read()

      {:ok, _} =
        Accounts.reset_password(reset_token.token, "newpassword456", "newpassword456")

      # Trusted device should be gone
      {:ok, nil} = Accounts.find_trusted_device(user.id, device.device_token)
    end

    test "fails with expired token", %{user: _user} do
      :ok = Accounts.request_password_reset("reset-test@example.com")

      {:ok, [reset_token | _]} = Saleflow.Accounts.PasswordResetToken |> Ash.read()

      # Manually expire the token via raw SQL
      expired_at = DateTime.add(DateTime.utc_now(), -3600, :second)

      Saleflow.Repo.query!(
        "UPDATE password_reset_tokens SET expires_at = $1 WHERE id = $2",
        [expired_at, Ecto.UUID.dump!(reset_token.id)]
      )

      assert {:error, :invalid_or_expired_token} =
               Accounts.reset_password(reset_token.token, "newpass123", "newpass123")
    end
  end
end
