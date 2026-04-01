defmodule SaleflowWeb.AdminController do
  use SaleflowWeb, :controller

  alias Saleflow.Accounts
  alias Saleflow.Repo

  @doc """
  List all users (admin only).
  """
  def users(conn, _params) do
    {:ok, users} = Accounts.list_users()
    json(conn, %{users: Enum.map(users, &serialize_user/1)})
  end

  @doc """
  Create a new user (admin only).
  """
  def create_user(conn, params) do
    user_params = %{
      email: params["email"],
      name: params["name"],
      password: params["password"],
      password_confirmation: params["password_confirmation"],
      role: parse_role(params["role"])
    }

    case Accounts.register(user_params) do
      {:ok, user} ->
        conn
        |> put_status(:created)
        |> json(%{user: serialize_user(user)})

      {:error, _} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to create user"})
    end
  end

  @doc """
  Return lead counts grouped by status.
  """
  def stats(conn, _params) do
    query = """
    SELECT status, COUNT(*) as count
    FROM leads
    GROUP BY status
    ORDER BY status
    """

    {:ok, %{rows: rows}} = Repo.query(query)

    stats =
      Enum.into(rows, %{}, fn [status, count] ->
        {status, count}
      end)

    json(conn, %{stats: stats})
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp serialize_user(user) do
    %{
      id: user.id,
      email: to_string(user.email),
      name: user.name,
      role: user.role
    }
  end

  defp parse_role("admin"), do: :admin
  defp parse_role("agent"), do: :agent
  defp parse_role(_), do: :agent
end
