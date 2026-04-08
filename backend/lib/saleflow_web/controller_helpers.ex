defmodule SaleflowWeb.ControllerHelpers do
  @moduledoc "Shared helpers for SaleflowWeb controllers."

  @doc "Add key to map only if value is not nil or empty string"
  def maybe_put(map, _key, nil), do: map
  def maybe_put(map, _key, ""), do: map
  def maybe_put(map, key, value), do: Map.put(map, key, value)
end
