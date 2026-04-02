defmodule Saleflow.Repo.Migrations.AddPasswordResetTokens do
  @moduledoc """
  Creates the password_reset_tokens table for forgot-password functionality.
  """

  use Ecto.Migration

  def up do
    create table(:password_reset_tokens, primary_key: false) do
      add :id, :uuid, null: false, default: fragment("gen_random_uuid()"), primary_key: true
      add :user_id, :uuid, null: false
      add :token, :text, null: false
      add :expires_at, :utc_datetime_usec, null: false
      add :used_at, :utc_datetime_usec
      add :inserted_at, :utc_datetime_usec, null: false, default: fragment("now()")
    end

    create unique_index(:password_reset_tokens, [:token],
             name: "password_reset_tokens_unique_token_index"
           )

    create index(:password_reset_tokens, [:user_id])
  end

  def down do
    drop_if_exists unique_index(:password_reset_tokens, [:token],
                     name: "password_reset_tokens_unique_token_index"
                   )

    drop_if_exists index(:password_reset_tokens, [:user_id])
    drop table(:password_reset_tokens)
  end
end
