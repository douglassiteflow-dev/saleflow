defmodule SaleflowWeb.ConnCase do
  @moduledoc """
  This module defines the test case to be used by
  tests that require setting up a connection.

  Such tests rely on `Phoenix.ConnTest` and also
  import other functionality to make it easier
  to build common data structures and query the data layer.

  Finally, if the test case interacts with the database,
  we enable the SQL sandbox, so changes done to the database
  are reverted at the end of every test. If you are using
  PostgreSQL, you can even run database tests asynchronously
  by setting `use SaleflowWeb.ConnCase, async: true`, although
  this option is not recommended for other databases.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      # The default endpoint for testing
      @endpoint SaleflowWeb.Endpoint

      use SaleflowWeb, :verified_routes

      # Import conveniences for testing with connections
      import Plug.Conn
      import Phoenix.ConnTest
      import SaleflowWeb.ConnCase
    end
  end

  setup tags do
    Saleflow.DataCase.setup_sandbox(tags)
    {:ok, conn: Phoenix.ConnTest.build_conn()}
  end

  @doc """
  Creates a test user and returns an authenticated connection with a
  session_token set in the session (backed by a real LoginSession).
  """
  def register_and_log_in_user(conn, attrs \\ %{}) do
    user_attrs =
      Map.merge(
        %{
          email: "test-#{System.unique_integer([:positive])}@example.com",
          name: "Test User",
          password: "password123",
          password_confirmation: "password123"
        },
        attrs
      )

    {:ok, user} = Saleflow.Accounts.register(user_attrs)

    conn = log_in_user(conn, user)

    {conn, user}
  end

  @doc """
  Sets up an authenticated connection by creating a LoginSession and
  putting its session_token in the Phoenix session.
  """
  def log_in_user(conn, user) do
    {:ok, session} =
      Saleflow.Accounts.create_login_session(user, %{
        ip_address: "127.0.0.1",
        user_agent: "test-agent"
      })

    conn
    |> Plug.Test.init_test_session(%{})
    |> Plug.Conn.put_session(:session_token, session.session_token)
  end
end
