defmodule Saleflow.Apps do
  use Ash.Domain

  resources do
    resource Saleflow.Apps.App
    resource Saleflow.Apps.AppPermission
  end
end
