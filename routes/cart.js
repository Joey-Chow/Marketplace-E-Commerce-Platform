const express = require("express");
const { auth } = require("../middleware/auth");
const CartService = require("../services/CartService");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

// @route   GET /api/cart
// @desc    Get user's cart
// @access  Private
router.get(
  "/",
  auth,
  asyncHandler(async (req, res) => {
    const cart = await CartService.getUserCart(req.user.id);
    res.json(new ApiResponse(200, { cart }, "Cart retrieved successfully"));
  })
);

// @route   POST /api/cart/add
// @desc    Add item to cart
// @access  Private
router.post(
  "/add",
  auth,
  asyncHandler(async (req, res) => {
    const { productId, quantity } = req.body;
    const cart = await CartService.addToCart(req.user.id, productId, quantity);
    res.json(new ApiResponse(200, { cart }, "Item added to cart successfully"));
  })
);

// @route   POST /api/cart/items
// @desc    Add item to cart (alternate endpoint)
// @access  Private
router.post(
  "/items",
  auth,
  asyncHandler(async (req, res) => {
    const { productId, quantity } = req.body;
    const cart = await CartService.addToCart(req.user.id, productId, quantity);
    res.json(new ApiResponse(200, { cart }, "Item added to cart successfully"));
  })
);

// @route   PUT /api/cart/update
// @desc    Update item quantity in cart
// @access  Private
router.put(
  "/update",
  auth,
  asyncHandler(async (req, res) => {
    const { productId, quantity } = req.body;
    const cart = await CartService.updateCartItem(
      req.user.id,
      productId,
      quantity
    );
    res.json(new ApiResponse(200, { cart }, "Cart item updated successfully"));
  })
);

// @route   PUT /api/cart/items/:productId
// @desc    Update item quantity in cart (alternate endpoint)
// @access  Private
router.put(
  "/items/:productId",
  auth,
  asyncHandler(async (req, res) => {
    const { quantity } = req.body;
    const cart = await CartService.updateCartItem(
      req.user.id,
      req.params.productId,
      quantity
    );
    res.json(new ApiResponse(200, { cart }, "Cart item updated successfully"));
  })
);

// @route   DELETE /api/cart/remove/:productId
// @desc    Remove item from cart
// @access  Private
router.delete(
  "/remove/:productId",
  auth,
  asyncHandler(async (req, res) => {
    const cart = await CartService.removeFromCart(
      req.user.id,
      req.params.productId
    );
    res.json(
      new ApiResponse(200, { cart }, "Item removed from cart successfully")
    );
  })
);

// @route   DELETE /api/cart/items/:productId
// @desc    Remove item from cart (alternate endpoint)
// @access  Private
router.delete(
  "/items/:productId",
  auth,
  asyncHandler(async (req, res) => {
    const cart = await CartService.removeFromCart(
      req.user.id,
      req.params.productId
    );
    res.json(
      new ApiResponse(200, { cart }, "Item removed from cart successfully")
    );
  })
);

// @desc   toggle select item in cart
// @route  POST /api/cart/select/:productId
// @access Private
router.post(
  "/select/:productId",
  auth,
  asyncHandler(async (req, res) => {
    const cart = await CartService.toggleItemSelection(
      req.user.id,
      req.params.productId
    );
    res.json(
      new ApiResponse(200, { cart }, "Item selection toggled successfully")
    );
  })
);

module.exports = router;
