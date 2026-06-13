<?php
$author_name = get_option('author_name', 'John Smith');
$author_bio = get_option('author_bio', 'A passionate writer.');
$author_phone = get_option('author_phone', '');
?>
<div class="author-bio">
    <h4><?php echo esc_html($author_name); ?></h4>
    <p><?php echo wp_kses_post($author_bio); ?></p>
    <?php if ($author_phone): ?>
    <p><?php echo $author_phone; ?></p>
    <?php endif; ?>
</div>
