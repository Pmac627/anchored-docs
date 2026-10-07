namespace Orders;

/// <summary>
/// Submits an order and reserves stock. This class does not retry.
/// </summary>
/// <seealso href="docs/flows/order-fulfillment.md"/>
public class OrderService
{
    /// <summary>Submits the order to the queue.</summary>
    public async Task SubmitAsync(Order order) { }

    // Utilize the validator prior to submission, e.g. before the queue is called.
    private bool Validate(Order order) => true;
}
