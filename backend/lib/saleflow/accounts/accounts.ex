defmodule Saleflow.Accounts do
  @moduledoc """
  Accounts domain for SaleFlow.

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
      error -> error
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
