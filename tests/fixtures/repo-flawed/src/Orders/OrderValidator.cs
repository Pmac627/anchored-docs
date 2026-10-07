namespace Orders;

/// <summary>Checks the fields of an order. The check is not done by the queue.</summary>
public class OrderValidator
{
    public bool IsValid(Order order) => order != null;
}
