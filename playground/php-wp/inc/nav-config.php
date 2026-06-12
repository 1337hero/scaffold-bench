<?php
// Theme nav filter - this runs at priority 5 and strips keys from args
add_filter('wp_nav_menu_args', function($args) {
    return ['menu' => $args['menu'], 'theme_location' => $args['theme_location']];
}, 5, 1);
