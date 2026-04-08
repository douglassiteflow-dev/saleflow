defmodule Saleflow.Sales.ContactTest do
  @moduledoc """
  Tests for the Contact resource and Sales domain contact functions.
  """

  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "Kontakt AB #{unique}", telefon: "+4670#{unique}"})
    lead
  end

  # ---------------------------------------------------------------------------
  # Tests
  # ---------------------------------------------------------------------------

  describe "create_contact/1" do
    test "creates a contact with all fields" do
      lead = create_lead!()

      {:ok, contact} =
        Sales.create_contact(%{
          lead_id: lead.id,
          name: "Anna Svensson",
          role: "VD",
          phone: "+46701234567",
          email: "anna@example.com"
        })

      assert contact.lead_id == lead.id
      assert contact.name == "Anna Svensson"
      assert contact.role == "VD"
      assert contact.phone == "+46701234567"
      assert contact.email == "anna@example.com"
      assert contact.id != nil
      assert contact.inserted_at != nil
      assert contact.updated_at != nil
    end

    test "creates a contact with only name" do
      lead = create_lead!()

      {:ok, contact} =
        Sales.create_contact(%{
          lead_id: lead.id,
          name: "Erik Johansson"
        })

      assert contact.lead_id == lead.id
      assert contact.name == "Erik Johansson"
      assert is_nil(contact.role)
      assert is_nil(contact.phone)
      assert is_nil(contact.email)
    end

    test "fails without lead_id" do
      {:error, _} =
        Sales.create_contact(%{
          name: "No Lead"
        })
    end

    test "fails without name" do
      lead = create_lead!()

      {:error, _} =
        Sales.create_contact(%{
          lead_id: lead.id,
          role: "Ekonomichef"
        })
    end
  end

  describe "list_contacts_for_lead/1" do
    test "returns contacts for a lead sorted by inserted_at asc" do
      lead = create_lead!()

      {:ok, c1} = Sales.create_contact(%{lead_id: lead.id, name: "Första"})
      {:ok, c2} = Sales.create_contact(%{lead_id: lead.id, name: "Andra"})
      {:ok, c3} = Sales.create_contact(%{lead_id: lead.id, name: "Tredje"})

      {:ok, contacts} = Sales.list_contacts_for_lead(lead.id)

      assert length(contacts) == 3
      assert Enum.map(contacts, & &1.id) == [c1.id, c2.id, c3.id]
    end

    test "returns empty list for lead with no contacts" do
      lead = create_lead!()
      {:ok, contacts} = Sales.list_contacts_for_lead(lead.id)
      assert contacts == []
    end

    test "does not return contacts for other leads" do
      lead1 = create_lead!()
      lead2 = create_lead!()

      {:ok, _} = Sales.create_contact(%{lead_id: lead1.id, name: "Lead1 Contact"})
      {:ok, _} = Sales.create_contact(%{lead_id: lead2.id, name: "Lead2 Contact"})

      {:ok, contacts} = Sales.list_contacts_for_lead(lead1.id)

      assert length(contacts) == 1
      assert hd(contacts).name == "Lead1 Contact"
    end
  end

  describe "delete_contact/1" do
    test "deletes a contact" do
      lead = create_lead!()
      {:ok, contact} = Sales.create_contact(%{lead_id: lead.id, name: "To Delete"})

      assert :ok = Sales.delete_contact(contact)

      {:ok, contacts} = Sales.list_contacts_for_lead(lead.id)
      assert contacts == []
    end
  end
end
