defmodule Saleflow.Telavox.ClientBehaviour do
  @moduledoc "Behaviour for Telavox API client, enabling test mocking."

  @callback get_as(token :: String.t(), path :: String.t()) ::
              {:ok, map()} | {:error, atom() | tuple()}
  @callback post_as(token :: String.t(), path :: String.t()) ::
              {:ok, map()} | {:error, atom() | tuple()}
end
