<?php
/*
 * Plugin Name: Recent Posts Widget
 */

add_shortcode('recent_posts', function($atts) {
    $count = isset($atts['count']) ? $atts['count'] : 5;
    $posts = get_posts(['numberposts' => $count]);

    $output = '<ul>';
    foreach ($posts as $post) {
        $output .= '<li>' . $post->post_title . '</li>';
    }
    $output .= '</ul>';

    echo $output;
});
