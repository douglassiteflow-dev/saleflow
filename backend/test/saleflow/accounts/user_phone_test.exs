defmodule Saleflow.Accounts.UserPhoneTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Accounts.User
  require Ash.Query

  defp create_user(unique) do
    User
    |> Ash.Changeset.for_create(:register_with_password, %{
      email: "agent#{unique}@test.se",
      name: "Agent #{unique}",
      password: "Password123!",
      password_confirmation: "Password123!"
    })
    |> Ash.create!()
  end

  describe "phone_number" do
    test "kan uppdateras med ett telefonnummer" do
      user = create_user("phone1")

      {:ok, updated} =
        user
        |> Ash.Changeset.for_update(:update_user, %{phone_number: "+46701234567"})
        |> Ash.update()

      assert updated.phone_number == "+46701234567"
    end

    test "returneras vid läsning av användare" do
      user = create_user("phone2")

      {:ok, updated} =
        user
        |> Ash.Changeset.for_update(:update_user, %{phone_number: "+46709999999"})
        |> Ash.update()

      user_id = updated.id

      {:ok, [read_user]} =
        User
        |> Ash.Query.filter(id == ^user_id)
        |> Ash.read()

      assert read_user.phone_number == "+46709999999"
    end

    test "två användare kan inte ha samma telefonnummer" do
      user1 = create_user("phone3a")
      user2 = create_user("phone3b")

      {:ok, _} =
        user1
        |> Ash.Changeset.for_update(:update_user, %{phone_number: "+46701111111"})
        |> Ash.update()

      assert {:error, _} =
               user2
               |> Ash.Changeset.for_update(:update_user, %{phone_number: "+46701111111"})
               |> Ash.update()
    end

    test "telefonnummer är nil som standard" do
      user = create_user("phone4")
      assert user.phone_number == nil
    end

    test "telefonnummer kan uppdateras till ett nytt värde" do
      user = create_user("phone5")

      {:ok, updated1} =
        user
        |> Ash.Changeset.for_update(:update_user, %{phone_number: "+46701111111"})
        |> Ash.update()

      assert updated1.phone_number == "+46701111111"

      {:ok, updated2} =
        updated1
        |> Ash.Changeset.for_update(:update_user, %{phone_number: "+46702222222"})
        |> Ash.update()

      assert updated2.phone_number == "+46702222222"
    end
  end
end
