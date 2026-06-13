<?php
function apply_member_discount($total) {
    return $total * 0.9;
}
add_filter('cart_total', 'apply_member_discount', 10, 1);

function get_cart_total($subtotal) {
    return apply_filters('cart_total', $subtotal);
}
