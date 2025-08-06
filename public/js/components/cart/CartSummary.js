// CartSummary Component - Shows subtotal, tax, total and checkout button
const CartSummary = ({ cart, loading, selectedItems = [], getCartSummary }) => {
  const [showPaymentModal, setShowPaymentModal] = React.useState(false);
  const [checkoutLoading, setCheckoutLoading] = React.useState(false);

  // Use cart summary from backend, fallback to cart totals if available
  const subtotal = cart.totals?.subtotal || 0;
  const tax = cart.totals?.tax || 0;
  const shipping = cart.totals?.shipping || 0;
  const total = cart.totals?.total || 0;

  // Get selected items for checkout
  const getSelectedItemsForCheckout = () => {
    console.log("Cart items:", cart.items);
    console.log("Selected items:", selectedItems);

    const filteredItems = cart.items
      .filter((item) => {
        const productId = item.product?._id || item.product;
        console.log(
          "Checking product ID:",
          productId,
          "in selectedItems:",
          selectedItems.includes(productId)
        );
        return selectedItems.includes(productId);
      })
      .map((item) => item.product?._id || item.product);

    console.log("Filtered items for checkout:", filteredItems);
    return filteredItems;
  };

  const handleCheckout = () => {
    setShowPaymentModal(true);
  };

  const handlePaymentConfirm = async ({ paymentMethod, shippingAddress }) => {
    setCheckoutLoading(true);

    try {
      const selectedItemsForCheckout = getSelectedItemsForCheckout();

      // Validate that we have selected items
      if (!selectedItemsForCheckout || selectedItemsForCheckout.length === 0) {
        alert("❌ Please select items to checkout");
        setCheckoutLoading(false);
        return;
      }

      console.log("Sending checkout request with:", {
        selectedItems: selectedItemsForCheckout,
        paymentMethod,
        shippingAddress,
      });

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("marketplace_token")}`,
        },
        body: JSON.stringify({
          selectedItems: selectedItemsForCheckout,
          paymentMethod,
          shippingAddress,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ Order placed successfully! Order ID: ${result.order._id}`);
        setShowPaymentModal(false);

        // Refresh cart to remove selected items
        if (window.location.reload) {
          window.location.reload();
        }
      } else {
        alert(`❌ Checkout failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert(`❌ Checkout failed: ${error.message}`);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handlePaymentCancel = () => {
    setShowPaymentModal(false);
  };

  // render right section of the page
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "div",
      { className: "cart-summary-container" },

      React.createElement(
        "div",
        { className: "cart-summary-header" },
        React.createElement("h3", null, "Order Summary")
      ),

      React.createElement(
        "div",
        { className: "cart-summary-details" },

        // Subtotal
        React.createElement(
          "div",
          { className: "summary-line" },
          React.createElement("span", null, "Subtotal:"),
          React.createElement(
            "span",
            { className: "amount" },
            `$${subtotal.toFixed(2)}`
          )
        ),

        // Tax
        React.createElement(
          "div",
          { className: "summary-line" },
          React.createElement("span", null, "Tax:"),
          React.createElement(
            "span",
            { className: "amount" },
            `$${tax.toFixed(2)}`
          )
        ),

        // Shipping
        React.createElement(
          "div",
          { className: "summary-line" },
          React.createElement("span", null, "Shipping:"),
          React.createElement(
            "span",
            { className: `amount ${shipping === 0 ? "free" : ""}` },
            shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`
          )
        ),

        // Total
        React.createElement(
          "div",
          { className: "summary-line total-line" },
          React.createElement("span", { className: "total-label" }, "Total:"),
          React.createElement(
            "span",
            { className: "total-amount" },
            `$${total.toFixed(2)}`
          )
        )
      ),

      React.createElement(
        "div",
        { className: "cart-summary-actions" },

        // Checkout Button
        React.createElement(
          "button",
          {
            onClick: handleCheckout,
            disabled:
              loading ||
              cart.items.length === 0 ||
              selectedItems.length === 0 ||
              checkoutLoading,
            className: "btn btn-primary checkout-btn",
          },
          checkoutLoading
            ? "Processing..."
            : selectedItems.length === 0
            ? "Select items to checkout"
            : "Proceed to Checkout"
        )
      )
    ),

    // Payment Modal
    React.createElement(PaymentModal, {
      isOpen: showPaymentModal,
      onClose: handlePaymentCancel,
      onConfirm: handlePaymentConfirm,
      orderSummary: { subtotal, tax, shipping, total },
      loading: checkoutLoading,
    })
  );
};

// Expose CartSummary to global scope
window.CartSummary = CartSummary;
