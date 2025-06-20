import { Box, Button, Tooltip, useTheme, IconButton } from '@mui/material';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import ArticleIcon from '@mui/icons-material/Article';
import ListAltIcon from '@mui/icons-material/ListAlt';
import SplitscreenIcon from '@mui/icons-material/Splitscreen';

interface PDFViewerControlsProps {
  showLeftPanel: boolean;
  setShowLeftPanel: React.Dispatch<React.SetStateAction<boolean>>;
  showPdfPanel: boolean;
  setShowPdfPanel: React.Dispatch<React.SetStateAction<boolean>>;
}

const PDFViewerControls: React.FC<PDFViewerControlsProps> = ({
  showLeftPanel,
  setShowLeftPanel,
  showPdfPanel,
  setShowPdfPanel,
}) => {
  const theme = useTheme();
  
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Tooltip title={showLeftPanel ? "Hide Extraction Panel" : "Show Extraction Panel"}>
        <IconButton
          onClick={() => setShowLeftPanel((prev: boolean) => !prev)}
          sx={{ 
            color: showLeftPanel ? theme.palette.primary.main : theme.palette.text.secondary,
            backgroundColor: showLeftPanel ? theme.palette.action.selected : 'transparent',
            '&:hover': {
              backgroundColor: showLeftPanel ? theme.palette.action.selected : theme.palette.action.hover,
            },
            borderRadius: '4px',
            padding: '8px',
            border: showLeftPanel ? `1px solid ${theme.palette.divider}` : '1px solid transparent',
          }}
        >
          <SplitscreenIcon sx={{ fontSize: 20, transform: 'rotate(90deg)' }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={showPdfPanel ? "Hide PDF Panel" : "Show PDF Panel"}>
        <IconButton
          onClick={() => setShowPdfPanel(prev => !prev)}
          sx={{ 
            color: showPdfPanel ? theme.palette.primary.main : theme.palette.text.secondary,
            backgroundColor: showPdfPanel ? theme.palette.action.selected : 'transparent',
            '&:hover': {
              backgroundColor: showPdfPanel ? theme.palette.action.selected : theme.palette.action.hover,
            },
            borderRadius: '4px',
            padding: '8px',
            border: showPdfPanel ? `1px solid ${theme.palette.divider}` : '1px solid transparent',
          }}
        >
          <ArticleIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default PDFViewerControls; 