defmodule Saleflow.Repo.Migrations.AddDurationMinutesToMeetings do
  @moduledoc """
  Adds duration_minutes to meetings table.
  """

  use Ecto.Migration

  def up do
    alter table(:meetings) do
      add_if_not_exists :duration_minutes, :bigint, null: false, default: 30
    end
  end

  def down do
    alter table(:meetings) do
      remove_if_exists :duration_minutes, :bigint
    end
  end
end
