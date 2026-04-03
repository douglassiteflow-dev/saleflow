defmodule Saleflow.Accounts.LoginSession do
  @moduledoc """
  LoginSession resource for Saleflow.

  Tracks active and historical login sessions per user. Each session records
  device type, browser, geographic location (city/country from IP), and
  lifecycle timestamps (login, last active, logout).

  Sessions are created when a user successfully authenticates and can be
  individually logged out or force-logged-out by an admin.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Accounts

  postgres do
    table "login_sessions"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :user_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :session_token, :string do
      allow_nil? false
      public? true
    end

    attribute :ip_address, :string do
      allow_nil? true
      public? true
    end

    attribute :user_agent, :string do
      allow_nil? true
      public? true
    end

    attribute :device_type, :string do
      allow_nil? true
      public? true
    end

    attribute :browser, :string do
      allow_nil? true
      public? true
    end

    attribute :city, :string do
      allow_nil? true
      public? true
    end

    attribute :country, :string do
      allow_nil? true
      public? true
    end

    attribute :logged_in_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end

    attribute :last_active_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end

    attribute :logged_out_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    attribute :force_logged_out, :boolean do
      default false
      allow_nil? false
      public? true
    end
  end

  identities do
    identity :unique_session_token, [:session_token]
  end

  actions do
    read :read do
      primary? true
    end

    create :create do
      description "Create a new login session"
      accept [:user_id, :ip_address, :user_agent, :device_type, :browser, :city, :country]

      change fn changeset, _context ->
        token = :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
        now = DateTime.utc_now()

        changeset
        |> Ash.Changeset.force_change_attribute(:session_token, token)
        |> Ash.Changeset.force_change_attribute(:logged_in_at, now)
        |> Ash.Changeset.force_change_attribute(:last_active_at, now)
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "session.created"}
    end

    update :touch do
      description "Update last_active_at to now"
      require_atomic? false

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :last_active_at, DateTime.utc_now())
      end
    end

    update :logout do
      description "Log out this session by setting logged_out_at"
      require_atomic? false

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :logged_out_at, DateTime.utc_now())
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "session.logged_out"}
    end

    update :force_logout do
      description "Force log out this session (admin action)"
      require_atomic? false

      change fn changeset, _context ->
        now = DateTime.utc_now()

        changeset
        |> Ash.Changeset.force_change_attribute(:logged_out_at, now)
        |> Ash.Changeset.force_change_attribute(:force_logged_out, true)
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "session.force_logged_out"}
    end

    read :list_active_for_user do
      description "List active (not logged out) sessions for a user, newest first"
      argument :user_id, :uuid, allow_nil?: false

      filter expr(user_id == ^arg(:user_id) and is_nil(logged_out_at))
      prepare build(sort: [logged_in_at: :desc])
    end

    read :list_all_for_user do
      description "List all sessions for a user, newest first"
      argument :user_id, :uuid, allow_nil?: false

      filter expr(user_id == ^arg(:user_id))
      prepare build(sort: [logged_in_at: :desc])
    end
  end
end
