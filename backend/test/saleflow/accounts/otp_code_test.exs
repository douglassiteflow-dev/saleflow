defmodule Saleflow.Accounts.OtpCodeTest do
  use Saleflow.DataCase, async: true

  import Ecto.Query

  alias Saleflow.Accounts
  alias Saleflow.Accounts.OtpCode

  @valid_user_params %{
    email: "otp_test@example.com",
    name: "OTP Test User",
    password: "password123",
    password_confirmation: "password123"
  }

  defp create_user(email) do
    params = Map.put(@valid_user_params, :email, email)
    {:ok, user} = Accounts.register(params)
    user
  end

  defp unique_email do
    "otp_#{System.unique_integer([:positive])}@example.com"
  end

  # Directly backdate expires_at via raw Ecto to simulate expiry
  defp backdate_otp(otp_id) do
    past = DateTime.add(DateTime.utc_now(), -10 * 60, :second)
    id_bin = Ecto.UUID.dump!(otp_id)

    Saleflow.Repo.update_all(
      from(o in "otp_codes", where: o.id == ^id_bin),
      set: [expires_at: past]
    )
  end

  # Directly mark an OTP as used via raw Ecto
  defp mark_used_direct(otp_id) do
    now = DateTime.utc_now()
    id_bin = Ecto.UUID.dump!(otp_id)

    Saleflow.Repo.update_all(
      from(o in "otp_codes", where: o.id == ^id_bin),
      set: [used_at: now]
    )
  end

  # ---------------------------------------------------------------------------
  # create_otp/1
  # ---------------------------------------------------------------------------

  describe "create_otp/1" do
    test "generates a 6-digit string code" do
      user = create_user(unique_email())
      {:ok, otp} = Accounts.create_otp(user)

      assert is_binary(otp.code)
      assert String.length(otp.code) == 6
      assert otp.code =~ ~r/^\d{6}$/
    end

    test "sets expires_at approximately 5 minutes in the future" do
      user = create_user(unique_email())
      before = DateTime.utc_now()
      {:ok, otp} = Accounts.create_otp(user)
      after_t = DateTime.utc_now()

      expected_min = DateTime.add(before, 4 * 60 + 55, :second)
      expected_max = DateTime.add(after_t, 5 * 60 + 5, :second)

      assert DateTime.compare(otp.expires_at, expected_min) in [:gt, :eq]
      assert DateTime.compare(otp.expires_at, expected_max) in [:lt, :eq]
    end

    test "invalidates previous active OTPs for same user" do
      user = create_user(unique_email())
      {:ok, first_otp} = Accounts.create_otp(user)

      # Create a second OTP — should invalidate the first
      {:ok, _second_otp} = Accounts.create_otp(user)

      # Reload the first OTP and check it's marked as used
      {:ok, reloaded} = Ash.get(OtpCode, first_otp.id)
      refute is_nil(reloaded.used_at)
    end

    test "sends email in sandbox mode (returns :ok)" do
      user = create_user(unique_email())

      # In sandbox mode, send_email logs and returns {:ok, "sandbox"}.
      # create_otp returns {:ok, otp} confirming the call chain completed.
      assert {:ok, _otp} = Accounts.create_otp(user)
    end

    test "returns the newly created OTP" do
      user = create_user(unique_email())
      assert {:ok, otp} = Accounts.create_otp(user)

      assert otp.user_id == user.id
      refute is_nil(otp.id)
      refute is_nil(otp.expires_at)
      assert is_nil(otp.used_at)
    end
  end

  # ---------------------------------------------------------------------------
  # verify_otp/2
  # ---------------------------------------------------------------------------

  describe "verify_otp/2" do
    test "succeeds with correct code and returns user" do
      user = create_user(unique_email())
      {:ok, otp} = Accounts.create_otp(user)

      assert {:ok, verified_user} = Accounts.verify_otp(user.id, otp.code)
      assert verified_user.id == user.id
    end

    test "fails with wrong code, returns {:error, :invalid_code}" do
      user = create_user(unique_email())
      {:ok, _otp} = Accounts.create_otp(user)

      assert {:error, :invalid_code} = Accounts.verify_otp(user.id, "000000")
    end

    test "fails with expired code" do
      user = create_user(unique_email())
      {:ok, otp} = Accounts.create_otp(user)

      backdate_otp(otp.id)

      assert {:error, :invalid_code} = Accounts.verify_otp(user.id, otp.code)
    end

    test "fails with already-used code" do
      user = create_user(unique_email())
      {:ok, otp} = Accounts.create_otp(user)

      mark_used_direct(otp.id)

      assert {:error, :invalid_code} = Accounts.verify_otp(user.id, otp.code)
    end

    test "marks code as used (used_at set) after successful verification" do
      user = create_user(unique_email())
      {:ok, otp} = Accounts.create_otp(user)

      assert {:ok, _user} = Accounts.verify_otp(user.id, otp.code)

      {:ok, reloaded} = Ash.get(OtpCode, otp.id)
      refute is_nil(reloaded.used_at)
    end

    # Rate limit: count_recent_otp_attempts counts ALL OTPs (used or not) in the last 15 min.
    # The threshold is >= 5, so:
    #   - 4 OTPs in window → verify allowed
    #   - 5+ OTPs in window → verify blocked with {:error, :rate_limited}

    test "rate limit: 4 OTPs in window, 5th verify succeeds" do
      user = create_user(unique_email())

      # Create 3 OTPs (each auto-invalidates the previous via create_otp)
      for _ <- 1..3 do
        Accounts.create_otp(user)
      end

      # Create the 4th OTP — now 4 in window; verify should still succeed
      {:ok, otp} = Accounts.create_otp(user)

      # At verify time: 4 OTPs in the 15-min window → count = 4 < 5 → allowed
      assert {:ok, _user} = Accounts.verify_otp(user.id, otp.code)
    end

    test "rate limit: 5 OTPs in window returns {:error, :rate_limited}" do
      user = create_user(unique_email())

      # Create 5 OTPs in the window
      for _ <- 1..5 do
        Accounts.create_otp(user)
      end

      # At verify time: 5 OTPs in the window → count = 5 >= 5 → rate limited
      assert {:error, :rate_limited} = Accounts.verify_otp(user.id, "123456")
    end
  end

  # ---------------------------------------------------------------------------
  # invalidate_otps/1
  # ---------------------------------------------------------------------------

  describe "invalidate_otps/1" do
    test "marks all active OTPs as used" do
      user = create_user(unique_email())

      # Create two OTPs directly (bypass create_otp which auto-invalidates)
      {:ok, otp1} =
        OtpCode
        |> Ash.Changeset.for_create(:create, %{user_id: user.id})
        |> Ash.create()

      {:ok, otp2} =
        OtpCode
        |> Ash.Changeset.for_create(:create, %{user_id: user.id})
        |> Ash.create()

      Accounts.invalidate_otps(user.id)

      {:ok, reloaded1} = Ash.get(OtpCode, otp1.id)
      {:ok, reloaded2} = Ash.get(OtpCode, otp2.id)

      refute is_nil(reloaded1.used_at)
      refute is_nil(reloaded2.used_at)
    end

    test "does not affect OTPs for other users" do
      user1 = create_user(unique_email())
      user2 = create_user(unique_email())

      {:ok, otp_user2} =
        OtpCode
        |> Ash.Changeset.for_create(:create, %{user_id: user2.id})
        |> Ash.create()

      Accounts.invalidate_otps(user1.id)

      {:ok, reloaded} = Ash.get(OtpCode, otp_user2.id)
      assert is_nil(reloaded.used_at)
    end
  end

  # ---------------------------------------------------------------------------
  # Code generation quality
  # ---------------------------------------------------------------------------

  describe "OTP code generation" do
    test "code is always 6 digits (run 100 times)" do
      user = create_user(unique_email())

      results =
        for _ <- 1..100 do
          {:ok, otp} =
            OtpCode
            |> Ash.Changeset.for_create(:create, %{user_id: user.id})
            |> Ash.create()

          otp.code
        end

      for code <- results do
        assert String.length(code) == 6, "Expected 6-digit code, got: #{code}"
        assert code =~ ~r/^\d{6}$/, "Code is not all digits: #{code}"
      end
    end
  end

  # ---------------------------------------------------------------------------
  # Audit log
  # ---------------------------------------------------------------------------

  describe "audit logging" do
    test "audit log created on OTP create" do
      user = create_user(unique_email())
      {:ok, otp} = Accounts.create_otp(user)

      {:ok, logs} = Saleflow.Audit.list_for_resource("OtpCode", otp.id)
      assert Enum.any?(logs, fn log -> log.action == "otp.created" end)
    end

    test "audit log created on OTP verify (mark_used)" do
      user = create_user(unique_email())
      {:ok, otp} = Accounts.create_otp(user)

      {:ok, _user} = Accounts.verify_otp(user.id, otp.code)

      {:ok, logs} = Saleflow.Audit.list_for_resource("OtpCode", otp.id)
      assert Enum.any?(logs, fn log -> log.action == "otp.verified" end)
    end
  end
end
