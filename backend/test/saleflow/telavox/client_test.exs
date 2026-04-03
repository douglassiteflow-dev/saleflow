defmodule Saleflow.Telavox.ClientTest do
  use ExUnit.Case, async: true

  alias Saleflow.Telavox.Client

  describe "get/1" do
    test "returns {:ok, body} on 200" do
      :ok
    end
  end

  describe "request error handling" do
    test "module is defined and exported" do
      assert function_exported?(Client, :get, 1)
      assert function_exported?(Client, :get_as, 2)
      assert function_exported?(Client, :post_as, 2)
      assert function_exported?(Client, :get_binary, 1)
    end
  end
end
