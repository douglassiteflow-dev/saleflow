defmodule SaleflowWeb.ImportController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales.Import

  @doc """
  Import leads from an uploaded XLSX file.

  Expects a multipart form upload with a `file` field.
  """
  def create(conn, %{"file" => %Plug.Upload{path: path}}) do
    with {:ok, rows} <- Import.parse_xlsx(path),
         {:ok, result} <- Import.import_rows(rows) do
      conn
      |> put_status(:created)
      |> json(%{created: result.created, skipped: result.skipped})
    else
      {:error, reason} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Import failed: #{inspect(reason)}"})
    end
  end

  def create(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "file upload is required"})
  end
end
