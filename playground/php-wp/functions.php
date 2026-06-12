<?php
require_once __DIR__ . '/wp-stubs.php';
require_once __DIR__ . '/inc/pricing.php';

// Bug: hooks the discount callback twice (also registered in inc/pricing.php)
add_filter('cart_total', 'apply_member_discount', 10, 1);

// Note: Plugin Boilerplate integration - see plugins/ directory for third-party extensions
