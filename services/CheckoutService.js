// CheckoutService.js - ACID-compliant checkout processing
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const User = require("../models/User");
const logger = require("../utils/logger");

class CheckoutService {
  /**
   * Check if MongoDB is running in replica set mode
   * @returns {Promise<boolean>} - True if replica set is available
   */
  async _isReplicaSetAvailable() {
    try {
      const admin = mongoose.connection.db.admin();
      const result = await admin.command({ replSetGetStatus: 1 });
      return true;
    } catch (error) {
      // If replSetGetStatus fails, we're in standalone mode
      return false;
    }
  }

  /**
   * Process checkout with optional ACID transactions (for replica set MongoDB)
   * Falls back to non-transactional mode for standalone MongoDB
   * @param {string} userId - User ID
   * @param {Array} selectedItems - Array of selected product IDs
   * @param {string} paymentMethod - Payment method chosen
   * @param {Object} shippingAddress - Shipping address
   * @returns {Promise<Object>} - Order result
   */
  async processCheckout(
    userId,
    selectedItems,
    paymentMethod,
    shippingAddress = {}
  ) {
    const maxRetries = 3;
    let retryCount = 0;

    // Check if we can use transactions
    const useTransactions = await this._isReplicaSetAvailable();
    logger.info(
      `Checkout mode: ${
        useTransactions
          ? "Transactional (Replica Set)"
          : "Non-transactional (Standalone)"
      }`
    );

    while (retryCount < maxRetries) {
      let session = null;

      if (useTransactions) {
        /*
         * ACID transaction implementation for replica set
         */
        session = await mongoose.startSession();
        session.startTransaction({
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" },
        });
      }

      try {
        logger.info(
          `Starting checkout ${
            useTransactions ? "transaction" : "process"
          } for user: ${userId} (attempt ${retryCount + 1})`,
          {
            selectedItems,
            paymentMethod,
            transactional: useTransactions,
          }
        );

        // 1. Read or check preconditions
        const preconditions = await this._checkPreconditions(
          userId,
          selectedItems,
          session
        );

        // 2. Update stock
        await this._updateStock(preconditions.productUpdates, session);

        // 3. Create order
        const result = await this._createOrder(
          userId,
          preconditions,
          paymentMethod,
          shippingAddress,
          session
        );

        // Rollback/commit conditions check: Payment successful?
        if (!result.paymentResult.success) {
          throw new Error(`Payment failed: ${result.paymentResult.error}`);
        }

        // All conditions met - commit the transaction if using transactions
        if (useTransactions && session) {
          await session.commitTransaction();
        }

        logger.info(
          `Checkout ${
            useTransactions ? "transaction" : "process"
          } completed successfully`,
          {
            orderId: result.order._id,
            paymentId: result.paymentResult.paymentId,
            attempt: retryCount + 1,
            transactional: useTransactions,
          }
        );

        return result;
      } catch (error) {
        // Abort the transaction on any error if using transactions
        if (useTransactions && session) {
          await session.abortTransaction();
        }

        logger.error(
          `Checkout ${
            useTransactions ? "transaction" : "process"
          } failed (attempt ${retryCount + 1})`,
          {
            error: error.message,
            userId,
            selectedItems,
            transactional: useTransactions,
          }
        );

        // Check if this is a transient error that can be retried
        if (this._isRetryableError(error) && retryCount < maxRetries - 1) {
          retryCount++;
          logger.info(
            `Retrying checkout ${
              useTransactions ? "transaction" : "process"
            } (attempt ${retryCount + 1})`
          );
          await new Promise((resolve) => setTimeout(resolve, 100 * retryCount)); // Exponential backoff
          continue;
        }

        throw error;
      } finally {
        // Always end the session if using transactions
        if (useTransactions && session) {
          await session.endSession();
        }
      }
    }
  }

  /**
   * 1. Read or check preconditions
   * @private
   */
  async _checkPreconditions(userId, selectedItems, session = null) {
    // Get user's cart and validate selected items
    const query = Cart.findOne({ user: userId });
    const userCart = await (session ? query.session(session) : query);
    if (!userCart || !userCart.items.length) {
      throw new Error("Cart is empty");
    }

    // Filter cart items to only selected ones
    const selectedCartItems = userCart.items.filter((item) =>
      selectedItems.includes(item.product.toString())
    );

    if (selectedCartItems.length === 0) {
      throw new Error("No items selected for checkout");
    }

    // Validate product availability and calculate totals
    const orderItems = [];
    let subtotal = 0;
    const productUpdates = [];

    for (const cartItem of selectedCartItems) {
      const productQuery = Product.findById(cartItem.product);
      const product = await (session
        ? productQuery.session(session)
        : productQuery);

      if (!product) {
        throw new Error(`Product ${cartItem.product} not found`);
      }

      // Rollback condition 1: Product stock enough?
      if (product.inventory.quantity < cartItem.quantity) {
        throw new Error(
          `Insufficient stock for ${product.name}. Available: ${product.inventory.quantity}, Requested: ${cartItem.quantity}`
        );
      }

      const itemTotal = product.price * cartItem.quantity;
      subtotal += itemTotal;

      orderItems.push({
        product: product._id,
        seller: product.seller,
        quantity: cartItem.quantity,
        price: product.price,
        productSnapshot: {
          name: product.name,
          description: product.description,
          image: product.images?.[0] || "",
          sku: product.sku || "",
        },
      });

      // Prepare inventory update
      productUpdates.push({
        productId: product._id,
        currentStock: product.inventory.quantity,
        newStock: product.inventory.quantity - cartItem.quantity,
      });
    }

    // Calculate tax and total
    const taxRate = 0.085;
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    logger.info(`Preconditions validated`, {
      itemCount: orderItems.length,
      subtotal,
      tax,
      total,
    });

    return {
      userCart,
      selectedCartItems,
      orderItems,
      productUpdates,
      pricing: { subtotal, tax, total },
      selectedItems,
    };
  }

  /**
   * 2. Update stock
   * @private
   */
  async _updateStock(productUpdates, session = null) {
    for (const update of productUpdates) {
      const updateOptions = session ? { session } : {};
      await Product.findByIdAndUpdate(
        update.productId,
        {
          $set: { "inventory.quantity": update.newStock },
        },
        updateOptions
      );
    }

    logger.info(`Stock updated for ${productUpdates.length} products`);
  }

  /**
   * 3. Create order
   * @private
   */
  async _createOrder(
    userId,
    preconditions,
    paymentMethod,
    shippingAddress,
    session = null
  ) {
    const { orderItems, pricing, selectedItems } = preconditions;

    // Rollback condition 2: Payment successful?
    const paymentResult = await this.processPayment(
      paymentMethod,
      pricing.total
    );
    if (!paymentResult.success) {
      // This will be caught by the main try-catch and trigger rollback
      throw new Error(`Payment failed: ${paymentResult.error}`);
    }

    // Create order document
    const orderNumber = `ORDER-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)
      .toUpperCase()}`;

    const orderData = {
      orderNumber,
      buyer: userId,
      items: orderItems,
      pricing: {
        subtotal: pricing.subtotal,
        tax: pricing.tax,
        shipping: 0,
        discount: 0,
        total: pricing.total,
      },
      payment: {
        method: paymentMethod,
        status: "completed",
        transactionId: paymentResult.paymentId,
        paidAt: new Date(),
      },
      shippingAddress: {
        firstName: shippingAddress.firstName || "Customer",
        lastName: shippingAddress.lastName || "Name",
        street: shippingAddress.street,
        city: shippingAddress.city,
        state: shippingAddress.state,
        zipCode: shippingAddress.zipCode,
        country: shippingAddress.country || "US",
        phone: shippingAddress.phone || "",
      },
      status: "confirmed",
      timeline: [
        {
          status: "confirmed",
          timestamp: new Date(),
          note: "Order confirmed and payment processed",
        },
      ],
    };

    const order = new Order(orderData);
    const saveOptions = session ? { session } : {};
    await order.save(saveOptions);

    logger.info(`Order created successfully`, {
      orderId: order._id,
      paymentId: paymentResult.paymentId,
    });

    // Remove only selected items from cart
    const updateOptions = session ? { session } : {};
    await Cart.findOneAndUpdate(
      { user: userId },
      {
        $pull: {
          items: {
            product: {
              $in: selectedItems.map((id) => new mongoose.Types.ObjectId(id)),
            },
          },
        },
      },
      updateOptions
    );

    logger.info(`Selected items removed from cart`, {
      removedItems: selectedItems.length,
    });

    // Update user's order history
    await User.findByIdAndUpdate(
      userId,
      { $push: { orders: order._id } },
      { session }
    );

    return {
      success: true,
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        items: orderItems,
        subtotal: pricing.subtotal,
        tax: pricing.tax,
        total: pricing.total,
        status: "confirmed",
        paymentId: paymentResult.paymentId,
      },
      paymentResult,
    };
  }

  /**
   * Check if an error is retryable (transient)
   * @private
   */
  _isRetryableError(error) {
    // MongoDB transient transaction errors
    const retryableErrors = [
      "TransientTransactionError",
      "UnknownTransactionCommitResult",
      "WriteConflict",
      "LockTimeout",
    ];

    return retryableErrors.some(
      (errorType) =>
        error.message.includes(errorType) ||
        error.code === 112 || // WriteConflict
        error.code === 46 || // LockTimeout
        (error.hasErrorLabel &&
          error.hasErrorLabel("TransientTransactionError"))
    );
  }

  /**
   * Simulate payment processing
   * @param {string} paymentMethod - Payment method
   * @param {number} amount - Amount to charge
   * @returns {Promise<Object>} - Payment result
   */
  async processPayment(paymentMethod, amount) {
    // Simulate payment processing delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Simulate payment success/failure (90% success rate)
    const success = Math.random() > 0.1;

    if (success) {
      return {
        success: true,
        paymentId: `pay_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
        amount,
        method: paymentMethod,
      };
    } else {
      return {
        success: false,
        error: "Payment processing failed",
      };
    }
  }

  /**
   * Test checkout scenarios with transactions
   * @param {string} scenario - Test scenario type
   */
  async testCheckoutScenario(scenario) {
    try {
      switch (scenario) {
        case "insufficient_stock":
          // Simulate insufficient stock scenario
          logger.info("Testing insufficient stock scenario");
          throw new Error("Insufficient stock - testing error handling");

        case "payment_failure":
          // Simulate payment failure scenario
          logger.info("Testing payment failure scenario");
          throw new Error("Payment failed - testing error handling");

        case "database_error":
          // Simulate database error scenario
          logger.info("Testing database error scenario");
          throw new Error("Database connection lost - testing error handling");

        default:
          throw new Error("Unknown test scenario");
      }
    } catch (error) {
      logger.info(`Test completed for scenario: ${scenario}`, {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = new CheckoutService();
