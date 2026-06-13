<?php
$author_name = get_option('author_name', 'John Smith');
$author_bio = get_option('author_bio', 'A passionate writer.');
?>
<div class="author-bio">
    <h4><?php echo esc_html($author_name); ?></h4>
    <p><?php echo wp_kses_post($author_bio); ?></p>
</div>
