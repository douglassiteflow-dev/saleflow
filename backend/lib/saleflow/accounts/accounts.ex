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
end
