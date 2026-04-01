defmodule Saleflow.Accounts.Token do
  @moduledoc """
  Token resource for AshAuthentication.

  Stores JWT tokens for authentication, password resets, and session management.
  Tokens are periodically purged as they expire.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshAuthentication.TokenResource],
    domain: Saleflow.Accounts

  postgres do
    table "tokens"
    repo Saleflow.Repo
  end
end
