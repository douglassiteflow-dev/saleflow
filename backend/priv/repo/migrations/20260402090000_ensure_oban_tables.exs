defmodule Saleflow.Repo.Migrations.EnsureObanTables do
  use Ecto.Migration

  def up do
    # Only create if not exists
    execute """
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'oban_jobs') THEN
        RAISE NOTICE 'Creating Oban tables...';
      END IF;
    END
    $$;
    """

    Oban.Migration.up(version: 12)
  end

  def down do
    Oban.Migration.down(version: 1)
  end
end
