<?php
/**
 * Plugin Name: Recent Posts Widget
 * Plugin URI: https://example.com/recent-posts-widget
 * Description: Adds a [recent_posts count="N"] shortcode.
 * Version: 1.0.0
 * Author: Developer
 */

add_shortcode('recent_posts', function($atts) {
    $default_count = absint(get_option('rpw_default_count', 5));
    $atts = shortcode_atts(['count' => $default_count], $atts, 'recent_posts');
    $count = max(1, min(10, absint($atts['count'])));

    $posts = get_posts(['numberposts' => $count]);

    $output = '<ul class="recent-posts">';
    foreach ($posts as $post) {
        $output .= '<li>' . esc_html($post->post_title) . '</li>';
    }
    $output .= '</ul>';

    return $output;
});
