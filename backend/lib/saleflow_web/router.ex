defmodule SaleflowWeb.Router do
  use SaleflowWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", SaleflowWeb do
    pipe_through :api
  end
end
