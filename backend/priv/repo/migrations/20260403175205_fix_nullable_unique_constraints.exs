defmodule Saleflow.Repo.Migrations.FixNullableUniqueConstraints do
  use Ecto.Migration

  def change do
    # Drop existing indexes
    drop_if_exists unique_index(:users, [:phone_number])
    drop_if_exists unique_index(:users, [:extension_number])

    # Create partial unique indexes (only enforce uniqueness for non-NULL values)
    create unique_index(:users, [:phone_number],
      where: "phone_number IS NOT NULL",
      name: :users_phone_number_unique
    )

    create unique_index(:users, [:extension_number],
      where: "extension_number IS NOT NULL",
      name: :users_extension_number_unique
    )
  end
end
