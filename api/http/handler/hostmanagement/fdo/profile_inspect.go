package fdo

import (
	"errors"
	"net/http"

	portainer "github.com/portainer/portainer/api"
	httperror "github.com/portainer/portainer/pkg/libhttp/error"
	"github.com/portainer/portainer/pkg/libhttp/request"
	"github.com/portainer/portainer/pkg/libhttp/response"
)

type fdoProfileResponse struct {
	Name        string `json:"name"`
	FileContent string `json:"fileContent"`
}

// @id fdoProfileInspect
// @summary retrieves a given FDO profile information and content
// @description retrieves a given FDO profile information and content
// @description **Access policy**: administrator
// @tags intel
// @security jwt
// @produce json
// @param id path int true "FDO Profile identifier"
// @success 200 "Success"
// @failure 400 "Invalid request"
// @failure 500 "Server error"
// @router /fdo/profiles/{id} [get]
func (handler *Handler) fdoProfileInspect(w http.ResponseWriter, r *http.Request) *httperror.HandlerError {
	id, err := request.RetrieveNumericRouteVariableValue(r, "id")
	if err != nil {
		return httperror.BadRequest("Bad request", errors.New("missing 'id' query parameter"))
	}

	profile, err := handler.DataStore.FDOProfile().Read(portainer.FDOProfileID(id))
	if err != nil {
		return httperror.InternalServerError("Unable to retrieve Profile", err)
	}

	fileContent, err := handler.FileService.GetFileContent(profile.FilePath, "")
	if err != nil {
		return httperror.InternalServerError("Unable to retrieve Profile file content", err)
	}

	return response.JSON(w, fdoProfileResponse{
		Name:        profile.Name,
		FileContent: string(fileContent),
	})
}
