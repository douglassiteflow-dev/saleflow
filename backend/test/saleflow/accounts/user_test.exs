defmodule Saleflow.Accounts.UserTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Accounts

  @valid_params %{
    email: "agent@example.com",
    name: "Jane Agent",
    password: "password123",
    password_confirmation: "password123"
  }

  describe "register/1" do
    test "creates a user with valid params" do
      assert {:ok, user} = Accounts.register(@valid_params)
      assert user.email == Ash.CiString.new("agent@example.com")
      assert user.name == "Jane Agent"
      assert user.role == :agent
      refute is_nil(user.id)
    end

    test "defaults role to :agent" do
      assert {:ok, user} = Accounts.register(@valid_params)
      assert user.role == :agent
    end

    test "allows setting role to :admin" do
      params = Map.put(@valid_params, :role, :admin)
      assert {:ok, user} = Accounts.register(params)
      assert user.role == :admin
    end

    test "rejects duplicate email" do
      assert {:ok, _user} = Accounts.register(@valid_params)

      assert {:error, error} = Accounts.register(@valid_params)
      assert is_struct(error, Ash.Error.Invalid)
    end

    test "rejects missing name" do
      params = Map.delete(@valid_params, :name)
      assert {:error, error} = Accounts.register(params)
      assert is_struct(error, Ash.Error.Invalid)
    end

    test "rejects missing email" do
      params = Map.delete(@valid_params, :email)
      assert {:error, error} = Accounts.register(params)
      assert is_struct(error, Ash.Error.Invalid)
    end

    test "rejects missing password" do
      params = Map.delete(@valid_params, :password)
      assert {:error, error} = Accounts.register(params)
      assert is_struct(error, Ash.Error.Invalid)
    end

    test "rejects password confirmation mismatch" do
      params = Map.put(@valid_params, :password_confirmation, "different_password")
      assert {:error, error} = Accounts.register(params)
      assert is_struct(error, Ash.Error.Invalid)
    end

    test "does not expose hashed_password in result" do
      assert {:ok, user} = Accounts.register(@valid_params)
      # hashed_password must never be the plaintext password and must be a bcrypt hash
      assert user.hashed_password != "password123"
      assert String.starts_with?(user.hashed_password, "$2b$")
    end
  end

  describe "sign_in/1" do
    setup do
      {:ok, user} = Accounts.register(@valid_params)
      {:ok, user: user}
    end

    test "returns user with valid credentials", %{user: _user} do
      assert {:ok, signed_in_user} =
               Accounts.sign_in(%{
                 email: "agent@example.com",
                 password: "password123"
               })

      assert signed_in_user.email == Ash.CiString.new("agent@example.com")
    end

    test "rejects invalid password" do
      assert {:error, _error} =
               Accounts.sign_in(%{
                 email: "agent@example.com",
                 password: "wrongpassword"
               })
    end

    test "rejects non-existent email" do
      assert {:error, _error} =
               Accounts.sign_in(%{
                 email: "nobody@example.com",
                 password: "password123"
               })
    end

    test "is case-insensitive for email" do
      assert {:ok, user} =
               Accounts.sign_in(%{
                 email: "AGENT@EXAMPLE.COM",
                 password: "password123"
               })

      assert user.name == "Jane Agent"
    end
  end

  describe "list_users/0" do
    test "returns empty list when no users exist" do
      assert {:ok, []} = Accounts.list_users()
    end

    test "returns all users" do
      {:ok, _user1} = Accounts.register(@valid_params)

      {:ok, _user2} =
        Accounts.register(%{
          email: "admin@example.com",
          name: "Admin User",
          password: "password123",
          password_confirmation: "password123",
          role: :admin
        })

      assert {:ok, users} = Accounts.list_users()
      assert length(users) == 2
    end

    test "returns users sorted by inserted_at ascending" do
      {:ok, first} = Accounts.register(@valid_params)

      {:ok, second} =
        Accounts.register(%{
          email: "second@example.com",
          name: "Second User",
          password: "password123",
          password_confirmation: "password123"
        })

      assert {:ok, [u1, u2]} = Accounts.list_users()
      assert u1.id == first.id
      assert u2.id == second.id
    end
  end
end
