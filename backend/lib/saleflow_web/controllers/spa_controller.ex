defmodule SaleflowWeb.SPAController do
  use SaleflowWeb, :controller

  def index(conn, _params) do
    conn
    |> put_resp_header("content-type", "text/html; charset=utf-8")
    |> send_file(200, Application.app_dir(:saleflow, "priv/static/index.html"))
  end
end
