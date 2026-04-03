defmodule Saleflow.Accounts do
  @moduledoc """
  Accounts domain for Saleflow.

  Manages user accounts and authentication. Provides functions for registering
  users, signing in, and listing users.

  ## Usage

      # Register a new user
      {:ok, user} = Saleflow.Accounts.register(%{
        email: "agent@example.com",
        name: "Jane Agent",
        password: "secret123",
        password_confirmation: "secret123"
      })

      # Sign in
      {:ok, user} = Saleflow.Accounts.sign_in(%{
        email: "agent@example.com",
        password: "secret123"
      })

      # List all users
      {:ok, users} = Saleflow.Accounts.list_users()
  """

  use Ash.Domain

  resources do
    resource Saleflow.Accounts.User
    resource Saleflow.Accounts.Token
    resource Saleflow.Accounts.OtpCode
    resource Saleflow.Accounts.LoginSession
    resource Saleflow.Accounts.TrustedDevice
    resource Saleflow.Accounts.PasswordResetToken
    resource Saleflow.Accounts.MicrosoftConnection
  end

  @doc """
  Registers a new user with the given parameters.

  Required params: `:email`, `:name`, `:password`, `:password_confirmation`
  Optional params: `:role` (defaults to `:agent`)
  """
  @spec register(map()) :: {:ok, Saleflow.Accounts.User.t()} | {:error, Ash.Error.t()}
  def register(params) do
    Saleflow.Accounts.User
    |> Ash.Changeset.for_create(:register_with_password, params)
    |> Ash.create()
  end

  @doc """
  Signs in a user with email and password.

  Returns `{:ok, user}` on success, `{:error, reason}` on failure.
  """
  @spec sign_in(map()) :: {:ok, Saleflow.Accounts.User.t()} | {:error, Ash.Error.t()}
  def sign_in(params) do
    Saleflow.Accounts.User
    |> Ash.Query.for_read(:sign_in_with_password, params)
    |> Ash.read_one()
  end

  @doc """
  Returns a list of all users sorted by insertion time (oldest first).
  """
  @spec list_users() :: {:ok, list(Saleflow.Accounts.User.t())} | {:error, Ash.Error.t()}
  def list_users do
    Saleflow.Accounts.User
    |> Ash.Query.for_read(:list)
    |> Ash.read()
  end

  @doc """
  Creates an OTP code for the given user.

  Invalidates all existing active OTPs for the user first, then creates a new
  6-digit code valid for 5 minutes. Sends the code to the user's email
  synchronously (critical path — caller knows if delivery failed).

  Returns `{:ok, otp}` on success, `{:error, reason}` on failure.
  """
  @spec create_otp(Saleflow.Accounts.User.t()) ::
          {:ok, Saleflow.Accounts.OtpCode.t()} | {:error, term()}
  def create_otp(user) do
    # Invalidate existing active OTPs first
    invalidate_otps(user.id)

    # Create new OTP
    {:ok, otp} =
      Saleflow.Accounts.OtpCode
      |> Ash.Changeset.for_create(:create, %{user_id: user.id})
      |> Ash.create()

    # Send email synchronously (critical path)
    {subject, html} = Saleflow.Notifications.Templates.render_otp_code(otp.code)
    Saleflow.Notifications.Mailer.send_email(to_string(user.email), subject, html)

    {:ok, otp}
  end

  @doc """
  Verifies an OTP code for the given user.

  Enforces a rate limit of 5 attempts per 15 minutes (counted by OTP creation).
  On success, marks the OTP as used and returns `{:ok, user}`.

  Returns:
  - `{:ok, user}` — valid code, returns the authenticated user
  - `{:error, :invalid_code}` — code not found, expired, or already used
  - `{:error, :rate_limited}` — too many attempts in 15 minutes
  - `{:error, reason}` — other errors
  """
  @spec verify_otp(Ecto.UUID.t(), String.t()) ::
          {:ok, Saleflow.Accounts.User.t()} | {:error, :invalid_code | :rate_limited | term()}
  def verify_otp(user_id, code) do
    attempt_count = count_recent_otp_attempts(user_id)

    if attempt_count >= 5 do
      {:error, :rate_limited}
    else
      case find_active_otp(user_id, code) do
        {:ok, otp} ->
          otp |> Ash.Changeset.for_update(:mark_used, %{}) |> Ash.update()
          Ash.get(Saleflow.Accounts.User, user_id)

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  @doc """
  Invalidates all active OTPs for a given user by marking them as used.

  An active OTP is one that has not been used (`used_at` is nil) and has not
  yet expired (`expires_at` is in the future). Always returns `:ok`.
  """
  @spec invalidate_otps(Ecto.UUID.t()) :: :ok
  def invalidate_otps(user_id) do
    require Ash.Query
    now = DateTime.utc_now()

    {:ok, active} =
      Saleflow.Accounts.OtpCode
      |> Ash.Query.filter(user_id == ^user_id and is_nil(used_at) and expires_at > ^now)
      |> Ash.read()

    for otp <- active do
      otp |> Ash.Changeset.for_update(:mark_used, %{}) |> Ash.update()
    end

    :ok
  end

  # ---------------------------------------------------------------------------
  # Session management
  # ---------------------------------------------------------------------------

  @doc """
  Creates a login session for the given user, parsing UA and looking up GeoIP.

  `conn_info` should be a map with `:ip_address` and `:user_agent` keys.
  """
  @spec create_login_session(Saleflow.Accounts.User.t(), map()) ::
          {:ok, Saleflow.Accounts.LoginSession.t()} | {:error, term()}
  def create_login_session(user, conn_info) do
    ua = Saleflow.Auth.UserAgentParser.parse(conn_info[:user_agent] || conn_info.user_agent)

    {:ok, geo} = Saleflow.Auth.GeoIP.lookup(conn_info[:ip_address] || conn_info.ip_address)

    Saleflow.Accounts.LoginSession
    |> Ash.Changeset.for_create(:create, %{
      user_id: user.id,
      ip_address: conn_info[:ip_address] || conn_info.ip_address,
      user_agent: conn_info[:user_agent] || conn_info.user_agent || "",
      device_type: ua.device_type,
      browser: ua.browser,
      city: geo.city,
      country: geo.country
    })
    |> Ash.create()
  end

  @doc """
  Finds a login session by its session token.

  Returns `{:ok, session}` if found, `{:ok, nil}` if not found.
  """
  @spec find_session_by_token(String.t()) ::
          {:ok, Saleflow.Accounts.LoginSession.t() | nil} | {:error, term()}
  def find_session_by_token(token) do
    require Ash.Query

    Saleflow.Accounts.LoginSession
    |> Ash.Query.filter(session_token == ^token)
    |> Ash.read_one()
  end

  @doc """
  Updates the `last_active_at` timestamp on a session to now.
  """
  @spec touch_session(Saleflow.Accounts.LoginSession.t()) ::
          {:ok, Saleflow.Accounts.LoginSession.t()} | {:error, term()}
  def touch_session(session) do
    session |> Ash.Changeset.for_update(:touch, %{}) |> Ash.update()
  end

  @doc """
  Marks a session as logged out by setting `logged_out_at`.
  """
  @spec logout_session(Saleflow.Accounts.LoginSession.t()) ::
          {:ok, Saleflow.Accounts.LoginSession.t()} | {:error, term()}
  def logout_session(session) do
    session |> Ash.Changeset.for_update(:logout, %{}) |> Ash.update()
  end

  @doc """
  Force-logs-out a session (admin action). Sets both `logged_out_at` and
  `force_logged_out = true`.
  """
  @spec force_logout_session(Saleflow.Accounts.LoginSession.t()) ::
          {:ok, Saleflow.Accounts.LoginSession.t()} | {:error, term()}
  def force_logout_session(session) do
    session |> Ash.Changeset.for_update(:force_logout, %{}) |> Ash.update()
  end

  @doc """
  Force-logs-out all active sessions for a user.

  Always returns `:ok` (individual failures are silently ignored).
  """
  @spec force_logout_all(Ecto.UUID.t()) :: :ok
  def force_logout_all(user_id) do
    {:ok, active} = list_active_sessions(user_id)
    for s <- active, do: force_logout_session(s)
    :ok
  end

  @doc """
  Returns all active (not yet logged-out) sessions for a user.
  """
  @spec list_active_sessions(Ecto.UUID.t()) ::
          {:ok, list(Saleflow.Accounts.LoginSession.t())} | {:error, term()}
  def list_active_sessions(user_id) do
    Saleflow.Accounts.LoginSession
    |> Ash.Query.for_read(:list_active_for_user, %{user_id: user_id})
    |> Ash.read()
  end

  @doc """
  Returns all sessions (active and logged-out) for a user.
  """
  @spec list_all_sessions(Ecto.UUID.t()) ::
          {:ok, list(Saleflow.Accounts.LoginSession.t())} | {:error, term()}
  def list_all_sessions(user_id) do
    Saleflow.Accounts.LoginSession
    |> Ash.Query.for_read(:list_all_for_user, %{user_id: user_id})
    |> Ash.read()
  end

  # ---------------------------------------------------------------------------
  # Trusted devices (remember me)
  # ---------------------------------------------------------------------------

  @doc """
  Creates a trusted device for the given user.

  Returns `{:ok, trusted_device}` with a unique `device_token`.
  """
  @spec create_trusted_device(Saleflow.Accounts.User.t(), String.t() | nil) ::
          {:ok, Saleflow.Accounts.TrustedDevice.t()} | {:error, term()}
  def create_trusted_device(user, device_name \\ nil) do
    Saleflow.Accounts.TrustedDevice
    |> Ash.Changeset.for_create(:create, %{user_id: user.id, device_name: device_name})
    |> Ash.create()
  end

  @doc """
  Finds a valid (non-expired) trusted device by user_id and device_token.

  Returns `{:ok, trusted_device}` if found and valid, `{:ok, nil}` if not.
  """
  @spec find_trusted_device(Ecto.UUID.t(), String.t()) ::
          {:ok, Saleflow.Accounts.TrustedDevice.t() | nil} | {:error, term()}
  def find_trusted_device(user_id, token) do
    require Ash.Query
    now = DateTime.utc_now()

    Saleflow.Accounts.TrustedDevice
    |> Ash.Query.filter(user_id == ^user_id and device_token == ^token and expires_at > ^now)
    |> Ash.read_one()
  end

  @doc """
  Deletes all expired trusted devices. Returns `:ok`.
  """
  @spec delete_expired_trusted_devices() :: :ok
  def delete_expired_trusted_devices do
    require Ash.Query
    now = DateTime.utc_now()

    {:ok, expired} =
      Saleflow.Accounts.TrustedDevice
      |> Ash.Query.filter(expires_at <= ^now)
      |> Ash.read()

    for device <- expired do
      Ash.destroy(device)
    end

    :ok
  end

  @doc """
  Deletes all trusted devices for a user. Returns `:ok`.
  """
  @spec delete_trusted_devices_for_user(Ecto.UUID.t()) :: :ok
  def delete_trusted_devices_for_user(user_id) do
    require Ash.Query

    {:ok, devices} =
      Saleflow.Accounts.TrustedDevice
      |> Ash.Query.filter(user_id == ^user_id)
      |> Ash.read()

    for device <- devices do
      Ash.destroy(device)
    end

    :ok
  end

  # ---------------------------------------------------------------------------
  # Password reset
  # ---------------------------------------------------------------------------

  @doc """
  Requests a password reset for the given email.

  Creates a reset token and sends an email with a link. Always returns `:ok`
  regardless of whether the email exists (to avoid leaking user existence).
  """
  @spec request_password_reset(String.t()) :: :ok
  def request_password_reset(email) do
    require Ash.Query

    case Saleflow.Accounts.User
         |> Ash.Query.filter(email == ^email)
         |> Ash.read_one() do
      {:ok, nil} ->
        :ok

      {:ok, user} ->
        {:ok, reset_token} =
          Saleflow.Accounts.PasswordResetToken
          |> Ash.Changeset.for_create(:create, %{user_id: user.id})
          |> Ash.create()

        frontend_url = Application.get_env(:saleflow, :frontend_url, "http://localhost:5173")
        reset_url = "#{frontend_url}/reset-password?token=#{reset_token.token}"

        {subject, html} =
          Saleflow.Notifications.Templates.render_password_reset(user.name, reset_url)

        Saleflow.Notifications.Mailer.send_email(to_string(user.email), subject, html)

        :ok

      {:error, _} ->
        :ok
    end
  end

  @doc """
  Resets a user's password using a valid reset token.

  On success, marks the token as used and invalidates all active sessions
  (forcing re-login everywhere).

  Returns `{:ok, user}` on success, `{:error, reason}` on failure.
  """
  @spec reset_password(String.t(), String.t(), String.t()) ::
          {:ok, Saleflow.Accounts.User.t()} | {:error, atom() | term()}
  def reset_password(token, new_password, new_password_confirmation) do
    require Ash.Query

    if new_password != new_password_confirmation do
      {:error, :passwords_do_not_match}
    else
      now = DateTime.utc_now()

      case Saleflow.Accounts.PasswordResetToken
           |> Ash.Query.filter(token == ^token and is_nil(used_at) and expires_at > ^now)
           |> Ash.read_one() do
        {:ok, nil} ->
          {:error, :invalid_or_expired_token}

        {:ok, reset_token} ->
          # Mark token as used
          reset_token
          |> Ash.Changeset.for_update(:mark_used, %{})
          |> Ash.update!()

          # Update user password
          {:ok, user} = Ash.get(Saleflow.Accounts.User, reset_token.user_id)

          {:ok, user} =
            user
            |> Ash.Changeset.for_update(:update_password, %{
              password: new_password,
              password_confirmation: new_password_confirmation
            })
            |> Ash.update()

          # Invalidate all sessions
          force_logout_all(user.id)

          # Delete all trusted devices
          delete_trusted_devices_for_user(user.id)

          {:ok, user}

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp find_active_otp(user_id, code) do
    require Ash.Query
    now = DateTime.utc_now()

    case Saleflow.Accounts.OtpCode
         |> Ash.Query.filter(
           user_id == ^user_id and code == ^code and is_nil(used_at) and expires_at > ^now
         )
         |> Ash.read_one() do
      {:ok, nil} -> {:error, :invalid_code}
      {:ok, otp} -> {:ok, otp}
    end
  end

  defp count_recent_otp_attempts(user_id) do
    require Ash.Query
    fifteen_min_ago = DateTime.add(DateTime.utc_now(), -15 * 60, :second)

    {:ok, otps} =
      Saleflow.Accounts.OtpCode
      |> Ash.Query.filter(user_id == ^user_id and inserted_at > ^fifteen_min_ago)
      |> Ash.read()

    length(otps)
  end
end
