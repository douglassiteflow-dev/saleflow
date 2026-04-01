defmodule SaleflowWeb.AuthController do
  use SaleflowWeb, :controller

  alias Saleflow.Accounts

  @doc """
  Sign in with email and password. Sets user_id in the session.
  """
  def sign_in(conn, %{"email" => email, "password" => password}) do
    case Accounts.sign_in(%{email: email, password: password}) do
      {:ok, user} ->
        conn
        |> put_session(:user_id, user.id)
        |> put_status(:ok)
        |> json(%{user: serialize_user(user)})

      {:error, _} ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "Invalid email or password"})
    end
  end

  def sign_in(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "email and password are required"})
  end

  @doc """
  Returns the currently authenticated user.
  """
  def me(conn, _params) do
    user = conn.assigns.current_user
    json(conn, %{user: serialize_user(user)})
  end

  @doc """
  Signs out by clearing the session.
  """
  def sign_out(conn, _params) do
    conn
    |> configure_session(drop: true)
    |> json(%{ok: true})
  end

  defp serialize_user(user) do
    %{
      id: user.id,
      email: to_string(user.email),
      name: user.name,
      role: user.role
    }
  end
end
