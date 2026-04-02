defmodule Saleflow.Accounts.User do
  @moduledoc """
  User resource for SaleFlow.

  Represents a system user (admin or sales agent). Authentication is handled
  via AshAuthentication's password strategy with bcrypt password hashing and
  JWT token generation.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshAuthentication],
    domain: Saleflow.Accounts

  postgres do
    table "users"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :email, :ci_string do
      allow_nil? false
      public? true
    end

    attribute :hashed_password, :string do
      allow_nil? false
      sensitive? true
    end

    attribute :name, :string do
      allow_nil? false
      public? true
    end

    attribute :role, :atom do
      constraints one_of: [:admin, :agent]
      default :agent
      allow_nil? false
      public? true
    end

    attribute :phone_number, :string do
      allow_nil? true
      public? true
    end

    timestamps()
  end

  identities do
    identity :unique_email, [:email]
    identity :unique_phone_number, [:phone_number]
  end

  authentication do
    tokens do
      enabled? true
      token_resource Saleflow.Accounts.Token
      require_token_presence_for_authentication? true
      signing_secret fn _, _ ->
        Application.fetch_env(:saleflow, :token_signing_secret)
      end
    end

    strategies do
      password :password do
        identity_field :email
        hashed_password_field :hashed_password
      end
    end
  end

  actions do
    defaults [:read]

    read :get_by_subject do
      description "Get a user by the subject claim in a JWT"
      argument :subject, :string, allow_nil?: false
      get? true
      prepare AshAuthentication.Preparations.FilterBySubject
    end

    read :list do
      description "List all users sorted by creation time"
      prepare build(sort: [inserted_at: :asc])
    end

    create :register_with_password do
      description "Register a new user with email and password"
      argument :password, :string, allow_nil?: false, sensitive?: true
      argument :password_confirmation, :string, allow_nil?: false, sensitive?: true
      accept [:email, :name, :role]
      validate AshAuthentication.Strategy.Password.PasswordConfirmationValidation
      change AshAuthentication.Strategy.Password.HashPasswordChange
      change AshAuthentication.GenerateTokenChange
    end

    read :sign_in_with_password do
      description "Sign in with email and password"
      argument :email, :ci_string, allow_nil?: false
      argument :password, :string, allow_nil?: false, sensitive?: true
      get? true
      prepare AshAuthentication.Strategy.Password.SignInPreparation
    end

    update :update_user do
      description "Update user name, role, or phone number"
      accept [:name, :role, :phone_number]
    end

    update :update_password do
      description "Update user password (used by password reset)"
      argument :password, :string, allow_nil?: false, sensitive?: true
      argument :password_confirmation, :string, allow_nil?: false, sensitive?: true
      require_atomic? false

      change fn changeset, _context ->
        password = Ash.Changeset.get_argument(changeset, :password)
        hashed = Bcrypt.hash_pwd_salt(password)
        Ash.Changeset.force_change_attribute(changeset, :hashed_password, hashed)
      end
    end
  end
end
