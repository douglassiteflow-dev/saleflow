defmodule Saleflow.Sales.Import do
  @moduledoc """
  XLSX import module for SaleFlow leads.

  Provides two public functions:

  - `import_rows/1` — takes a list of maps (e.g. parsed from XLSX) and bulk-creates
    leads, deduplicating by `telefon`. Returns `{:ok, %{created: N, skipped: N}}`.

  - `parse_xlsx/1` — reads an XLSX file from disk and returns a list of row maps
    with string keys matching column headers from the first row.

  ## Required fields

  Each row must contain both `"företag"` and `"telefon"` keys with non-blank values.
  Rows missing either required field are skipped.

  ## Deduplication

  A lead is skipped if:
  - The same `telefon` appears more than once in the current batch (first occurrence wins), OR
  - A lead with the same `telefon` already exists in the database.

  ## Audit logging

  An audit log entry (`"lead.imported"`) is created for every successfully imported lead.

  ## Example

      {:ok, rows} = Saleflow.Sales.Import.parse_xlsx("/tmp/leads.xlsx")
      {:ok, %{created: 47, skipped: 3}} = Saleflow.Sales.Import.import_rows(rows)
  """

  require Logger

  alias Saleflow.Repo
  alias Saleflow.Sales

  # All valid Lead fields that can be imported from XLSX column headers.
  # Keys are downcased column header strings → Lead atom field names.
  @field_mapping %{
    "företag" => :företag,
    "telefon" => :telefon,
    "epost" => :epost,
    "hemsida" => :hemsida,
    "adress" => :adress,
    "postnummer" => :postnummer,
    "stad" => :stad,
    "bransch" => :bransch,
    "orgnr" => :orgnr,
    "omsättning_tkr" => :omsättning_tkr,
    "vinst_tkr" => :vinst_tkr,
    "anställda" => :anställda,
    "vd_namn" => :vd_namn,
    "bolagsform" => :bolagsform,
    "källa" => :källa
  }

  @doc """
  Imports a list of row maps as leads.

  Each map should have string keys matching XLSX column headers. Invalid or
  duplicate rows are silently skipped.

  Accepts an optional `lead_list_id` parameter. When provided, all imported
  leads are associated with the given lead list.

  Returns `{:ok, %{created: integer(), skipped: integer()}}`.
  """
  @spec import_rows(list(map()), Ecto.UUID.t() | nil) ::
          {:ok, %{created: non_neg_integer(), skipped: non_neg_integer()}}
  def import_rows(rows, lead_list_id \\ nil) when is_list(rows) do
    now = DateTime.utc_now()
    existing_phones = fetch_existing_phones()

    {created, skipped, _seen_phones} =
      Enum.reduce(rows, {0, 0, MapSet.new()}, fn row, {created, skipped, seen} ->
        case process_row(row, seen, existing_phones, now, lead_list_id) do
          {:ok, phone} ->
            {created + 1, skipped, MapSet.put(seen, phone)}

          :skip ->
            {created, skipped + 1, seen}
        end
      end)

    {:ok, %{created: created, skipped: skipped}}
  end

  @doc """
  Parses an XLSX file at `file_path` and returns a list of row maps.

  Uses the first row as column headers. Each subsequent row becomes a map
  with those headers as string keys.

  Returns `{:ok, [%{header => value}]}` or `{:error, reason}`.
  """
  @spec parse_xlsx(String.t()) :: {:ok, list(map())} | {:error, term()}
  def parse_xlsx(file_path) when is_binary(file_path) do
    case Xlsxir.multi_extract(file_path, 0) do
      {:ok, table_id} ->
        rows = Xlsxir.get_list(table_id)
        Xlsxir.close(table_id)

        case rows do
          [] ->
            {:ok, []}

          [headers | data_rows] ->
            string_headers = Enum.map(headers, &to_string_value/1)
            row_maps = Enum.map(data_rows, fn row ->
              string_headers
              |> Enum.zip(row)
              |> Enum.into(%{}, fn {k, v} -> {k, to_string_value(v)} end)
            end)
            {:ok, row_maps}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  # Fetches all existing telefon values from the database as a MapSet.
  defp fetch_existing_phones do
    {:ok, %{rows: rows}} = Repo.query("SELECT telefon FROM leads WHERE telefon IS NOT NULL")
    rows |> Enum.map(fn [phone] -> phone end) |> MapSet.new()
  end

  defp process_row(row, seen_phones, existing_phones, now, lead_list_id) do
    with {:ok, params} <- validate_row(row),
         phone = params.telefon,
         false <- MapSet.member?(seen_phones, phone),
         false <- MapSet.member?(existing_phones, phone) do
      params = Map.put(params, :imported_at, now)
      params = if lead_list_id, do: Map.put(params, :lead_list_id, lead_list_id), else: params
      {:ok, lead} = Sales.create_lead(params)
      log_import(lead)
      {:ok, phone}
    else
      _ -> :skip
    end
  end

  # Validates that the row has required fields and maps string keys to atoms.
  defp validate_row(row) do
    företag = get_string_value(row, "företag")
    telefon = get_string_value(row, "telefon")

    if blank?(företag) or blank?(telefon) do
      :error
    else
      params =
        Enum.reduce(@field_mapping, %{}, fn {header, field}, acc ->
          value = get_string_value(row, header)
          if blank?(value), do: acc, else: Map.put(acc, field, value)
        end)

      {:ok, params}
    end
  end

  defp get_string_value(row, key) do
    case Map.get(row, key) do
      nil -> nil
      "" -> nil
      value -> to_string(value)
    end
  end

  defp blank?(nil), do: true
  defp blank?(_), do: false

  defp to_string_value(nil), do: nil
  defp to_string_value(v) when is_binary(v), do: v
  defp to_string_value(v), do: to_string(v)

  defp log_import(lead) do
    Saleflow.Audit.create_log(%{
      action: "lead.imported",
      resource_type: "Lead",
      resource_id: lead.id,
      changes: %{
        "företag" => %{"from" => nil, "to" => lead.företag},
        "telefon" => %{"from" => nil, "to" => lead.telefon}
      },
      metadata: %{"source" => "xlsx_import"}
    })
  end
end
