defmodule Saleflow.Contracts do
  @moduledoc """
  Contracts domain for Saleflow.

  Manages contracts and contract templates for the sales pipeline.
  """

  use Ash.Domain

  resources do
    resource Saleflow.Contracts.Contract
    resource Saleflow.Contracts.ContractTemplate
  end

  # ---------------------------------------------------------------------------
  # Contract functions
  # ---------------------------------------------------------------------------

  @doc "Creates a new contract."
  @spec create_contract(map()) :: {:ok, Saleflow.Contracts.Contract.t()} | {:error, Ash.Error.t()}
  def create_contract(params) do
    Saleflow.Contracts.Contract
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  @doc "Gets a contract by ID."
  @spec get_contract(Ecto.UUID.t()) :: {:ok, Saleflow.Contracts.Contract.t()} | {:error, Ash.Error.t()}
  def get_contract(id) do
    Saleflow.Contracts.Contract
    |> Ash.get(id)
  end

  @doc "Gets a contract by its access token."
  @spec get_contract_by_token(String.t()) :: {:ok, Saleflow.Contracts.Contract.t()} | {:error, Ash.Error.t()}
  def get_contract_by_token(token) do
    require Ash.Query

    Saleflow.Contracts.Contract
    |> Ash.Query.filter(access_token == ^token)
    |> Ash.read_one()
  end

  @doc "Marks a contract as sent."
  @spec mark_sent(Saleflow.Contracts.Contract.t()) :: {:ok, Saleflow.Contracts.Contract.t()} | {:error, Ash.Error.t()}
  def mark_sent(contract) do
    contract
    |> Ash.Changeset.for_update(:mark_sent, %{})
    |> Ash.update()
  end

  @doc "Marks a contract as viewed."
  @spec mark_viewed(Saleflow.Contracts.Contract.t()) :: {:ok, Saleflow.Contracts.Contract.t()} | {:error, Ash.Error.t()}
  def mark_viewed(contract) do
    contract
    |> Ash.Changeset.for_update(:mark_viewed, %{})
    |> Ash.update()
  end

  @doc "Signs a contract with customer details."
  @spec sign_contract(Saleflow.Contracts.Contract.t(), map()) :: {:ok, Saleflow.Contracts.Contract.t()} | {:error, Ash.Error.t()}
  def sign_contract(contract, params) do
    contract
    |> Ash.Changeset.for_update(:sign, params)
    |> Ash.update()
  end

  @doc "Updates tracking data for a contract."
  @spec update_tracking(Saleflow.Contracts.Contract.t(), map()) :: {:ok, Saleflow.Contracts.Contract.t()} | {:error, Ash.Error.t()}
  def update_tracking(contract, params) do
    contract
    |> Ash.Changeset.for_update(:update_tracking, params)
    |> Ash.update()
  end

  @doc "Cancels a contract (sets cancelled_at and 90-day cancellation end date)."
  @spec cancel_contract(Saleflow.Contracts.Contract.t()) :: {:ok, Saleflow.Contracts.Contract.t()} | {:error, Ash.Error.t()}
  def cancel_contract(contract) do
    contract
    |> Ash.Changeset.for_update(:cancel_contract, %{})
    |> Ash.update()
  end

  @doc "Supersedes a contract (used for renegotiation)."
  @spec supersede_contract(Saleflow.Contracts.Contract.t()) :: {:ok, Saleflow.Contracts.Contract.t()} | {:error, Ash.Error.t()}
  def supersede_contract(contract) do
    contract
    |> Ash.Changeset.for_update(:supersede, %{})
    |> Ash.update()
  end

  @doc "Lists all contracts for a given deal."
  @spec list_contracts_for_deal(Ecto.UUID.t()) :: {:ok, list(Saleflow.Contracts.Contract.t())} | {:error, Ash.Error.t()}
  def list_contracts_for_deal(deal_id) do
    require Ash.Query

    Saleflow.Contracts.Contract
    |> Ash.Query.filter(deal_id == ^deal_id)
    |> Ash.Query.sort(inserted_at: :desc)
    |> Ash.read()
  end

  @doc "Lists all contracts for a given user."
  @spec list_contracts_for_user(user_id :: Ecto.UUID.t()) :: {:ok, list(Saleflow.Contracts.Contract.t())} | {:error, Ash.Error.t()}
  def list_contracts_for_user(user_id) do
    require Ash.Query

    Saleflow.Contracts.Contract
    |> Ash.Query.filter(user_id == ^user_id)
    |> Ash.Query.sort(inserted_at: :desc)
    |> Ash.read()
  end

  # ---------------------------------------------------------------------------
  # ContractTemplate functions
  # ---------------------------------------------------------------------------

  @doc "Creates a new contract template."
  @spec create_template(map()) :: {:ok, Saleflow.Contracts.ContractTemplate.t()} | {:error, Ash.Error.t()}
  def create_template(params) do
    Saleflow.Contracts.ContractTemplate
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  @doc "Gets a contract template by ID."
  @spec get_template(Ecto.UUID.t()) :: {:ok, Saleflow.Contracts.ContractTemplate.t()} | {:error, Ash.Error.t()}
  def get_template(id) do
    Saleflow.Contracts.ContractTemplate
    |> Ash.get(id)
  end

  @doc "Lists all contract templates."
  @spec list_templates() :: {:ok, list(Saleflow.Contracts.ContractTemplate.t())} | {:error, Ash.Error.t()}
  def list_templates do
    Saleflow.Contracts.ContractTemplate
    |> Ash.Query.sort(inserted_at: :desc)
    |> Ash.read()
  end

  @doc "Updates a contract template."
  @spec update_template(Saleflow.Contracts.ContractTemplate.t(), map()) :: {:ok, Saleflow.Contracts.ContractTemplate.t()} | {:error, Ash.Error.t()}
  def update_template(template, params) do
    template
    |> Ash.Changeset.for_update(:update, params)
    |> Ash.update()
  end
end
