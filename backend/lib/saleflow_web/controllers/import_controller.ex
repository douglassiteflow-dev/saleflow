defmodule SaleflowWeb.ImportController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales.Import
  alias Saleflow.Sales

  @doc """
  Import leads from an uploaded XLSX file.

  Expects a multipart form upload with a `file` field.
  Optional `list_name` field: if provided, creates a LeadList with that name
  and assigns all imported leads to it.
  """
  # 5 minute timeout for large imports
  @import_timeout 300_000

  def create(conn, %{"file" => %Plug.Upload{path: path}} = params) do
    list_name = params["list_name"]

    task = Task.async(fn ->
      with {:ok, rows} <- Import.parse_xlsx(path),
           {:ok, lead_list_id} <- maybe_create_list(list_name),
           {:ok, result} <- Import.import_rows(rows, lead_list_id),
           :ok <- maybe_update_list_count(lead_list_id, result.created) do
        {:ok, result, lead_list_id}
      end
    end)

    case Task.await(task, @import_timeout) do
      {:ok, result, lead_list_id} ->
      response = %{created: result.created, skipped: result.skipped}
      response = if lead_list_id, do: Map.put(response, :list_id, lead_list_id), else: response

      conn
      |> put_status(:created)
      |> json(response)
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

  defp maybe_create_list(nil), do: {:ok, nil}
  defp maybe_create_list(""), do: {:ok, nil}

  defp maybe_create_list(name) when is_binary(name) do
    case Sales.create_lead_list(%{name: name}) do
      {:ok, list} -> {:ok, list.id}
      {:error, error} -> {:error, error}
    end
  end

  defp maybe_update_list_count(nil, _count), do: :ok

  defp maybe_update_list_count(list_id, count) do
    {:ok, list} = Sales.get_lead_list(list_id)

    list
    |> Ash.Changeset.for_update(:update_count, %{total_count: count})
    |> Ash.update()

    :ok
  end
end
