#pragma once

#include <string>
#include <vector>
#include <array>

namespace SignRecognition {

struct ImageData {
    uint8_t* data;
    int width;
    int height;
    int channels;
};

struct Point2D {
    float x, y;
};

struct HandLandmark {
    std::array<Point2D, 21> points;  // MediaPipe 손 랜드마크 21개 점
    float confidence;
    bool is_detected;
};

struct RecognitionResult {
    std::string gesture_name;
    int gesture_id;
    float confidence;
    std::vector<HandLandmark> hands;
    bool is_valid;
};

class SignRecognizer {
private:
    float detection_threshold_;
    float recognition_threshold_;
    bool is_initialized_;
    
    // 간단한 수화 제스처 데이터베이스
    struct GestureTemplate {
        std::string name;
        int id;
        std::array<Point2D, 21> template_points;
    };
    
    std::vector<GestureTemplate> gesture_templates_;
    
    // 손 검출을 위한 간단한 피부색 기반 검출
    bool detectSkinRegion(const ImageData& image, std::vector<Point2D>& contour);
    
    // 손 랜드마크 추정 (간소화된 버전)
    HandLandmark extractHandLandmarks(const ImageData& image, const std::vector<Point2D>& contour);
    
    // 제스처 매칭
    RecognitionResult matchGesture(const HandLandmark& hand);
    
    // 거리 계산
    float calculateDistance(const std::array<Point2D, 21>& points1, 
                           const std::array<Point2D, 21>& points2);

public:
    SignRecognizer();
    ~SignRecognizer();
    
    bool initialize();
    void cleanup();
    
    std::string get_version() const { return "1.0.0"; }
    
    void set_detection_threshold(float threshold) { detection_threshold_ = threshold; }
    void set_recognition_threshold(float threshold) { recognition_threshold_ = threshold; }
    
    RecognitionResult process_frame(const ImageData& image);
    
    // 제스처 템플릿 관리
    bool load_gesture_templates();
    void add_custom_gesture(const std::string& name, int id, const std::array<Point2D, 21>& points);
};

} // namespace SignRecognition