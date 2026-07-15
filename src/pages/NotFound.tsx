import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAppSettings } from "@/hooks/useAppSettings";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { lang } = useAppSettings();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div
      className="flex items-center justify-center bg-background px-6 pt-safe pb-safe"
      style={{ minHeight: '100dvh' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="text-center"
      >
        <h1 className="text-[64px] font-bold tracking-tight text-foreground/20 leading-none">404</h1>
        <p className="mt-3 text-[17px] font-semibold text-foreground">
          {lang === 'vi' ? 'Không tìm thấy trang' : 'Page not found'}
        </p>
        <p className="mt-1 text-[14px] text-muted-foreground">
          {lang === 'vi'
            ? 'Trang bạn tìm không tồn tại hoặc đã được di chuyển.'
            : "The page you're looking for doesn't exist or has moved."}
        </p>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => navigate("/", { replace: true })}
          className="mt-6 px-6 py-3 rounded-full bg-primary text-primary-foreground text-[15px] font-semibold touch-target"
        >
          {lang === 'vi' ? 'Về trang chính' : 'Back to Home'}
        </motion.button>
      </motion.div>
    </div>
  );
};

export default NotFound;
