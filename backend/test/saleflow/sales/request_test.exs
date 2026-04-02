defmodule Saleflow.Sales.RequestTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "user#{unique}@test.se",
        name: "User #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  # ---------------------------------------------------------------------------
  # create_request/1
  # ---------------------------------------------------------------------------

  describe "create_request/1" do
    test "creates a bug report with valid params" do
      user = create_user!()

      assert {:ok, request} =
               Sales.create_request(%{
                 user_id: user.id,
                 type: :bug,
                 description: "The dialer button crashes on click"
               })

      assert request.user_id == user.id
      assert request.type == :bug
      assert request.description == "The dialer button crashes on click"
      assert request.status == :new
      assert is_nil(request.admin_notes)
    end

    test "creates a feature request with valid params" do
      user = create_user!()

      assert {:ok, request} =
               Sales.create_request(%{
                 user_id: user.id,
                 type: :feature,
                 description: "Add dark mode support"
               })

      assert request.type == :feature
      assert request.status == :new
    end

    test "requires user_id" do
      assert {:error, _} =
               Sales.create_request(%{
                 type: :bug,
                 description: "Missing user"
               })
    end

    test "requires description" do
      user = create_user!()

      assert {:error, _} =
               Sales.create_request(%{
                 user_id: user.id,
                 type: :bug
               })
    end

    test "requires type" do
      user = create_user!()

      assert {:error, _} =
               Sales.create_request(%{
                 user_id: user.id,
                 description: "Some report"
               })
    end
  end

  # ---------------------------------------------------------------------------
  # list_requests/0
  # ---------------------------------------------------------------------------

  describe "list_requests/0" do
    test "returns all requests sorted by inserted_at desc" do
      user = create_user!()

      {:ok, r1} = Sales.create_request(%{user_id: user.id, type: :bug, description: "First"})
      {:ok, r2} = Sales.create_request(%{user_id: user.id, type: :feature, description: "Second"})

      {:ok, requests} = Sales.list_requests()
      ids = Enum.map(requests, & &1.id)

      # r2 is newer so should come first
      assert Enum.find_index(ids, &(&1 == r2.id)) < Enum.find_index(ids, &(&1 == r1.id))
    end
  end

  # ---------------------------------------------------------------------------
  # list_requests_for_user/1
  # ---------------------------------------------------------------------------

  describe "list_requests_for_user/1" do
    test "returns only requests for the given user" do
      user1 = create_user!()
      user2 = create_user!()

      {:ok, _r1} = Sales.create_request(%{user_id: user1.id, type: :bug, description: "User1 bug"})
      {:ok, _r2} = Sales.create_request(%{user_id: user2.id, type: :feature, description: "User2 feature"})

      {:ok, user1_requests} = Sales.list_requests_for_user(user1.id)
      assert length(user1_requests) == 1
      assert hd(user1_requests).user_id == user1.id
    end
  end

  # ---------------------------------------------------------------------------
  # update_request/2
  # ---------------------------------------------------------------------------

  describe "update_request/2" do
    test "updates status to in_progress" do
      user = create_user!()
      {:ok, request} = Sales.create_request(%{user_id: user.id, type: :bug, description: "A bug"})

      assert {:ok, updated} = Sales.update_request(request, %{status: :in_progress})
      assert updated.status == :in_progress
    end

    test "updates status and admin_notes" do
      user = create_user!()
      {:ok, request} = Sales.create_request(%{user_id: user.id, type: :feature, description: "Feature"})

      assert {:ok, updated} =
               Sales.update_request(request, %{
                 status: :done,
                 admin_notes: "Implemented in v2.1"
               })

      assert updated.status == :done
      assert updated.admin_notes == "Implemented in v2.1"
    end

    test "can reject a request" do
      user = create_user!()
      {:ok, request} = Sales.create_request(%{user_id: user.id, type: :bug, description: "A bug"})

      assert {:ok, updated} =
               Sales.update_request(request, %{
                 status: :rejected,
                 admin_notes: "Not a bug, works as designed"
               })

      assert updated.status == :rejected
    end
  end
end
