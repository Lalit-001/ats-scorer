from app.pipelines.geometry import overlap_ratio, boxes_overlap


def test_disjoint_boxes_have_zero_overlap():
    a = [0, 0, 10, 10]
    b = [20, 20, 30, 30]
    assert overlap_ratio(a, b) == 0.0
    assert boxes_overlap(a, b) is False


def test_link_fully_inside_image_has_full_overlap():
    image = [0, 0, 100, 100]
    link = [10, 10, 30, 30]  # small box entirely within the image
    assert overlap_ratio(link, image) == 1.0
    assert boxes_overlap(link, image) is True


def test_small_partial_overlap_is_below_threshold():
    a = [0, 0, 100, 100]
    b = [90, 90, 190, 190]  # only a 10x10 corner overlaps -> ratio 0.01
    assert overlap_ratio(a, b) == 0.01
    assert boxes_overlap(a, b, threshold=0.5) is False


def test_majority_overlap_is_above_threshold():
    image = [0, 0, 100, 100]
    link = [60, 0, 110, 100]  # 40x100 of the 50x100 link is inside -> ratio 0.8
    assert overlap_ratio(link, image) == 0.8
    assert boxes_overlap(link, image, threshold=0.5) is True
