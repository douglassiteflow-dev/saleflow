defmodule Saleflow.Telavox.UserLookup do
  @moduledoc """
  Single source of truth for mapping Telavox extensions/phone numbers to user IDs,
  and phone numbers to lead IDs.
  """

  alias Saleflow.Repo
  alias Saleflow.Sales

  @doc "Returns a map of extension/phone → user_id for all users with extension or phone set."
  def build_user_map do
    case Repo.query(
           "SELECT id, extension_number, phone_number FROM users WHERE extension_number IS NOT NULL OR phone_number IS NOT NULL"
         ) do
      {:ok, %{rows: rows}} ->
        Enum.reduce(rows, %{}, fn [id, ext, phone], acc ->
          user_id = Sales.decode_uuid(id)

          acc
          |> then(fn a -> if ext, do: Map.put(a, ext, user_id), else: a end)
          |> then(fn a -> if phone, do: Map.put(a, phone, user_id), else: a end)
        end)

      _ ->
        %{}
    end
  end

  @doc "Finds a user_id by extension_number or phone_number. Single-query version."
  def find_user_id(number) when is_binary(number) and number != "" do
    query = "SELECT id FROM users WHERE extension_number = $1 OR phone_number = $1 LIMIT 1"

    case Repo.query(query, [number]) do
      {:ok, %{rows: [[id]]}} -> Sales.decode_uuid(id)
      _ -> nil
    end
  end

  def find_user_id(_), do: nil

  @doc "Finds a lead_id by phone number (exact or suffix match)."
  def find_lead_id(number) when is_binary(number) and number != "" do
    query = "SELECT id FROM leads WHERE telefon = $1 OR telefon LIKE $2 LIMIT 1"
    like = "%" <> number

    case Repo.query(query, [number, like]) do
      {:ok, %{rows: [[id]]}} -> Sales.decode_uuid(id)
      _ -> nil
    end
  end

  def find_lead_id(_), do: nil
end
