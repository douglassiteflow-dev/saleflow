defmodule Saleflow.Repo.Migrations.AddTrustedDevices do
  @moduledoc """
  Creates the trusted_devices table for "remember me" functionality.
  """

  use Ecto.Migration

  def up do
    create table(:trusted_devices, primary_key: false) do
      add :id, :uuid, null: false, default: fragment("gen_random_uuid()"), primary_key: true
      add :user_id, :uuid, null: false
      add :device_token, :text, null: false
      add :device_name, :text
      add :expires_at, :utc_datetime_usec, null: false
      add :inserted_at, :utc_datetime_usec, null: false, default: fragment("now()")
    end

    create unique_index(:trusted_devices, [:device_token],
             name: "trusted_devices_unique_device_token_index"
           )

    create index(:trusted_devices, [:user_id])
    create index(:trusted_devices, [:expires_at])
  end

  def down do
    drop_if_exists unique_index(:trusted_devices, [:device_token],
                     name: "trusted_devices_unique_device_token_index"
                   )

    drop_if_exists index(:trusted_devices, [:user_id])
    drop_if_exists index(:trusted_devices, [:expires_at])
    drop table(:trusted_devices)
  end
end
