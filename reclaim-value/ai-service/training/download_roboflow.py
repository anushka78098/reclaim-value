"""Download Roboflow Universe datasets in YOLOv8 format.
export ROBOFLOW_API_KEY=...   (free account at roboflow.com)
python download_roboflow.py data/raw  iaac/constrcution-materials:2  robocount/steel-construction-materials:1 ...
Each arg is workspace/project:VERSION – open the dataset page and check the version number first."""
import os, sys
from roboflow import Roboflow
rf = Roboflow(api_key=os.environ["ROBOFLOW_API_KEY"]); dest = sys.argv[1]
for spec in sys.argv[2:]:
    path, ver = spec.split(":"); ws, proj = path.split("/")
    rf.workspace(ws).project(proj).version(int(ver)).download("yolov8", location=f"{dest}/{ws}__{proj}")
