defmodule SaleflowWeb.AuthCoverageTest do
  @moduledoc """
  Coverage tests for uncovered branches in AuthController:
  - verify_otp rate_limited path (line 56)
  """

  use SaleflowWeb.ConnCase, async: false

  alias Saleflow.Accounts

  @user_params %{
    email: "authcov@example.com",
    name: "AuthCov Agent",
    password: "password123",
    password_confirmation: "password123"
  }

  setup %{conn: conn} do
    {:ok, user} = Accounts.register(@user_params)
    %{conn: conn, user: user}
  end

  # ---------------------------------------------------------------------------
  # POST /api/auth/verify-otp — rate_limited branch
  # ---------------------------------------------------------------------------

  describe "POST /api/auth/verify-otp — rate_limited" do
    test "returns 429 when rate limit is exceeded (5+ OTP attempts in 15 min)", %{
      conn: conn,
      user: user
    } do
      # Create 5 OTPs in quick succession to exceed the rate limit
      for _ <- 1..5 do
        {:ok, _} = Accounts.create_otp(user)
      end

      # Now any verification attempt should be rate limited
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/auth/verify-otp", %{user_id: user.id, code: "123456"})

      assert %{"error" => msg} = json_response(conn, 429)
      assert msg =~ "Too many attempts"
    end
  end
end
